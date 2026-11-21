import "./framing.css";
import { createAppShell } from "../app";
import FramingApp from "./FramingApp.vue";

createAppShell(FramingApp).mount("#framing-app");
void useFramingStore(pinia).load();
