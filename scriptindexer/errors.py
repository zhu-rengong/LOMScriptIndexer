class ScriptIndexerError(Exception):
    exit_code = 1


class UsageError(ScriptIndexerError):
    exit_code = 2


class DataError(ScriptIndexerError):
    exit_code = 1
