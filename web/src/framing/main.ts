import { createApp } from "vue";
import "./framing.css";
import FramingApp from "./FramingApp.vue";
import { pinia } from "../stores";
import { useFramingStore } from "../stores/framing";

const app = createApp(FramingApp);
app.use(pinia);
app.mount("#framing-app");
void useFramingStore(pinia).load();
