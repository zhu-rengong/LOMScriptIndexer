import { createApp } from "vue";
import { createPinia } from "pinia";
import "./framing.css";
import FramingApp from "./FramingApp.vue";
import { useFramingStore } from "../stores/framing";

const pinia = createPinia();
const app = createApp(FramingApp);
app.use(pinia);
app.mount("#framing-app");
void useFramingStore(pinia).load();
