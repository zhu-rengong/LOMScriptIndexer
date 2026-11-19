import "./framing.css";
import { createAppShell } from "../app";
import FramingApp from "./FramingApp.vue";
import { pinia } from "../stores";
import { useFramingStore } from "../stores/framing";

createAppShell(FramingApp).mount("#framing-app");
void useFramingStore(pinia).load();
