from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .layout import GameLayout, UNITY_VERSION_FALLBACK
from .unity_objects import as_ref_dict, object_name as unity_object_name


def unitypy() -> Any:
    import UnityPy

    return UnityPy


def typetree_available() -> bool:
    try:
        import TypeTreeGeneratorAPI
    except Exception:
        return False
    return True


def _release_item(item: Any, seen: set[int]) -> None:
    if id(item) in seen:
        return
    seen.add(id(item))
    nested = getattr(item, "files", None)
    if isinstance(nested, dict) and getattr(item, "objects", None) is None:
        for child in list(nested.values()):
            _release_item(child, seen)
        nested.clear()
    cache = getattr(item, "_cache", None)
    if isinstance(cache, dict):
        cache.clear()
    objects = getattr(item, "objects", None)
    if isinstance(objects, dict):
        objects.clear()
    try:
        item.environment = None
    except Exception:
        pass
    for target in (getattr(item, "reader", None), item):
        dispose = getattr(target, "dispose", None)
        if callable(dispose):
            try:
                dispose()
            except Exception:
                pass


def _dispose(env: Any) -> None:
    seen: set[int] = set()
    for name in ("cabs", "files"):
        table = getattr(env, name, None)
        if not isinstance(table, dict):
            continue
        for item in list(table.values()):
            _release_item(item, seen)
        table.clear()


def unity_version(layout: GameLayout) -> str:
    for path in layout.files:
        try:
            env = unitypy().load(str(path))
        except Exception:
            continue
        try:
            for serialized in (getattr(env, "files", {}) or {}).values():
                version = str(getattr(serialized, "unity_version", "") or "").strip()
                if version:
                    return version
        finally:
            _dispose(env)
    return UNITY_VERSION_FALLBACK


def _is_string_array_node(node: Any) -> bool:
    children = getattr(node, "m_Children", None) or ()
    if getattr(node, "m_Type", "") != "string" or not children:
        return False
    array = children[0]
    if getattr(array, "m_Type", "") != "Array":
        return False
    items = getattr(array, "m_Children", None) or ()
    return len(items) > 1 and getattr(items[1], "m_Type", "") == "string"


def _repair_string_arrays(node: Any) -> Any:
    flat: list[dict[str, Any]] = []
    changed = False
    stack = [node]
    while stack:
        current = stack.pop()
        broken = _is_string_array_node(current)
        changed = changed or broken
        flat.append({
            "m_Level": current.m_Level,
            "m_Type": "vector" if broken else current.m_Type,
            "m_Name": current.m_Name,
            "m_MetaFlag": current.m_MetaFlag,
        })
        stack.extend(reversed(getattr(current, "m_Children", None) or ()))
    if not changed:
        return node
    from UnityPy.helpers.TypeTreeNode import TypeTreeNode

    return TypeTreeNode.from_list(flat)


class RepairedTypeTreeGenerator:
    def __init__(self, inner: Any) -> None:
        self.inner = inner
        self._nodes: dict[tuple[str, str], Any] = {}

    def get_nodes_up(self, assembly: str, fullname: str) -> Any:
        name = assembly if assembly.endswith(".dll") else f"{assembly}.dll"
        key = (name, fullname)
        node = self._nodes.get(key)
        if node is None:
            node = _repair_string_arrays(self.inner.get_nodes_up(name, fullname))
            self._nodes[key] = node
        return node

    def __getattr__(self, item: str) -> Any:
        return getattr(self.inner, item)


def try_build_generator(layout: GameLayout) -> Any | None:
    if not typetree_available():
        return None
    try:
        from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

        generator = TypeTreeGenerator(unity_version(layout))
    except Exception:
        return None

    assembly = layout.install_dir / "GameAssembly.dll"
    metadata = layout.data_dir / "il2cpp_data" / "Metadata" / "global-metadata.dat"
    if assembly.is_file() and metadata.is_file():
        try:
            generator.load_il2cpp(assembly.read_bytes(), metadata.read_bytes())
            return RepairedTypeTreeGenerator(generator)
        except Exception:
            pass

    managed = layout.data_dir / "Managed"
    loaded = 0
    if managed.is_dir():
        for dll in sorted(managed.glob("*.dll")):
            try:
                generator.load_dll(dll.read_bytes())
                loaded += 1
            except Exception:
                continue
    return RepairedTypeTreeGenerator(generator) if loaded else None


@dataclass(frozen=True)
class FileScope:
    session: AssetSession
    path: Path

    def local(self) -> dict[int, Any]:
        return self.session.local(self.path)

    def resolve(self, ref: Any) -> tuple[Any, FileScope] | None:
        return self.session.resolve(self.path, ref)

    def resolve_or_empty(self, ref: Any) -> tuple[Any, FileScope]:
        hit = self.resolve(ref)
        return hit if hit is not None else (None, self)

    def __call__(self, ref: Any) -> Any:
        return self.resolve_or_empty(ref)[0]

    def typetree(self, ref: Any) -> dict[str, Any] | None:
        hit = self.resolve(ref)
        if hit is None:
            return None
        obj, target = hit
        return target.session.typetree(target.path, obj)


class AssetSession:
    def __init__(self, layout: GameLayout, generator: Any | None = None,
                 log: Callable[[str], None] = print) -> None:
        self.layout = layout
        self.generator = generator
        self.log = log
        self.warnings = 0
        self._envs: dict[Path, Any] = {}
        self._objects: dict[Path, list[Any]] = {}
        self._locals: dict[Path, dict[int, Any]] = {}
        self._externals: dict[Path, list[str]] = {}
        self._scripts: dict[Path, dict[int, str]] = {}
        self._classes: dict[tuple[Path, int], str] = {}
        self._scopes: dict[Path, FileScope] = {}
        self._failed: set[Path] = set()
        self._warned: set[tuple[str, ...]] = set()
        self._type_index: dict[str, list[tuple[Path, Any]]] | None = None
        self._class_index: dict[str, list[tuple[Path, Any]]] | None = None

    def warn(self, message: str) -> None:
        self.warnings += 1
        self.log(f"      [warn] {message}")

    def warn_once(self, key: tuple[str, ...], message: str) -> None:
        if key in self._warned:
            return
        self._warned.add(key)
        self.warn(message)

    def open(self, path: Path) -> Any:
        target = Path(path)
        env = self._envs.get(target)
        if env is not None:
            return env
        if target in self._failed:
            raise LookupError(f"{target.name} failed to open earlier")
        try:
            env = unitypy().load(str(target))
        except Exception as exc:
            self._failed.add(target)
            self.warn_once(
                ("open", target.name, type(exc).__name__),
                f"failed to open {target.name}: {type(exc).__name__}")
            raise
        if self.generator is not None:
            env.typetree_generator = self.generator
        self._envs[target] = env
        return env

    def objects(self, path: Path) -> list[Any]:
        target = Path(path)
        objects = self._objects.get(target)
        if objects is None:
            objects = list(self.open(target).objects)
            self._objects[target] = objects
        return objects

    def local(self, path: Path) -> dict[int, Any]:
        target = Path(path)
        table = self._locals.get(target)
        if table is None:
            table = {obj.path_id: obj for obj in self.objects(target)}
            self._locals[target] = table
        return table

    def externals(self, path: Path) -> list[str]:
        target = Path(path)
        names = self._externals.get(target)
        if names is None:
            env = self.open(target)
            serialized = getattr(env, "file", None)
            if serialized is None:
                files = getattr(env, "files", {}) or {}
                serialized = next(iter(files.values()), None)
            names = []
            for external in (getattr(serialized, "externals", None) or []):
                name = Path(str(getattr(external, "path", "") or "")).name
                names.append(name)
            self._externals[target] = names
        return names

    def file_scope(self, path: Path) -> FileScope:
        target = Path(path)
        file_scope = self._scopes.get(target)
        if file_scope is None:
            file_scope = FileScope(self, target)
            self._scopes[target] = file_scope
        return file_scope

    def resolve(self, path: Path, ref: Any) -> tuple[Any, FileScope] | None:
        data = as_ref_dict(ref)
        if data is None:
            return None
        path_id = int(data.get("m_PathID") or 0)
        if not path_id:
            return None
        file_id = int(data.get("m_FileID") or 0)
        if file_id == 0:
            obj = self.local(path).get(path_id)
            return (obj, self.file_scope(path)) if obj is not None else None
        externals = self.externals(path)
        if not 1 <= file_id <= len(externals):
            return None
        target = Path(path).parent / externals[file_id - 1]
        if not target.is_file():
            return None
        try:
            file_scope = self.file_scope(target)
            obj = file_scope.local().get(path_id)
        except Exception as exc:
            self.warn_once(
                ("resolve", target.name, type(exc).__name__),
                f"failed to resolve {target.name}: {type(exc).__name__}")
            return None
        return (obj, file_scope) if obj is not None else None

    def monoscript_class_table(self, path: Path) -> dict[int, str]:
        target = Path(path)
        table = self._scripts.get(target)
        if table is not None:
            return table
        table = {}
        try:
            objects = self.objects(target)
        except Exception as exc:
            self.warn_once(
                ("scripts", target.name, type(exc).__name__),
                f"failed to read scripts from {target.name}: {type(exc).__name__}")
            self._scripts[target] = table
            return table
        for obj in objects:
            if obj.type.name != "MonoScript":
                continue
            try:
                data = obj.read()
            except Exception:
                continue
            table[obj.path_id] = str(getattr(data, "m_ClassName", "") or "")
        self._scripts[target] = table
        return table

    def monobehaviour_class(self, path: Path, obj: Any) -> str:
        target = Path(path)
        cache_key = (target, int(getattr(obj, "path_id", 0) or 0))
        hit = self._classes.get(cache_key)
        if hit is not None:
            return hit
        value = ""
        if obj.type.name == "MonoBehaviour":
            try:
                head = obj.parse_monobehaviour_head()
                resolved = self.resolve(target, getattr(head, "m_Script", None))
            except Exception:
                resolved = None
            if resolved is not None:
                script, file_scope = resolved
                value = file_scope.session.monoscript_class_table(file_scope.path).get(
                    int(getattr(script, "path_id", 0) or 0), "")
        self._classes[cache_key] = value
        return value

    def object_name(self, obj: Any) -> str:
        return unity_object_name(obj)

    def read_text(self, obj: Any) -> str:
        try:
            data = obj.read()
        except Exception as exc:
            self.warn_once(
                ("text", type(exc).__name__),
                f"failed to read TextAsset: {type(exc).__name__}")
            return ""
        text = getattr(data, "m_Script", None)
        if text is None:
            raw = getattr(data, "script", b"")
            text = raw.decode("utf-8", "replace") if isinstance(raw, (bytes, bytearray)) else str(raw)
        return str(text).lstrip("\ufeff")

    def typetree(self, path: Path, obj: Any) -> dict[str, Any] | None:
        if obj is None:
            return None
        try:
            return obj.read_typetree()
        except Exception as exc:
            self.warn_once(
                ("tree", Path(path).name, type(exc).__name__),
                f"failed to read typetree of {Path(path).name}"
                f" {getattr(obj, 'path_id', '?')}: {type(exc).__name__}")
            return None

    def _ensure_index(self) -> None:
        if self._class_index is not None and self._type_index is not None:
            return
        by_type: dict[str, list[tuple[Path, Any]]] = {}
        by_class: dict[str, list[tuple[Path, Any]]] = {}
        for path in self.layout.files:
            try:
                objects = self.objects(path)
            except Exception as exc:
                self.warn_once(
                    ("open", path.name, type(exc).__name__),
                    f"failed to open {path.name}: {type(exc).__name__}")
                continue
            for obj in objects:
                type_name = obj.type.name
                by_type.setdefault(type_name, []).append((path, obj))
                if type_name != "MonoBehaviour":
                    continue
                class_name = self.monobehaviour_class(path, obj)
                if class_name:
                    by_class.setdefault(class_name, []).append((path, obj))
        self._type_index = by_type
        self._class_index = by_class

    def iter_type(self, type_name: str) -> Iterator[tuple[Path, Any]]:
        self._ensure_index()
        for path, obj in self._type_index.get(type_name, ()):
            yield path, obj

    def find_type(self, type_name: str) -> tuple[Path, Any] | None:
        self._ensure_index()
        hits = self._type_index.get(type_name)
        return hits[0] if hits else None

    def iter_class(self, classes: set[str]) -> Iterator[tuple[Path, Any, str]]:
        self._ensure_index()
        for name in classes:
            for path, obj in self._class_index.get(name, ()):
                yield path, obj, name

    def close(self) -> None:
        for env in self._envs.values():
            _dispose(env)
        self._envs.clear()
        self._objects.clear()
        self._locals.clear()
        self._externals.clear()
        self._scripts.clear()
        self._classes.clear()
        self._scopes.clear()
        self._type_index = None
        self._class_index = None
        self.generator = None
