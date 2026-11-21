import type { Dataset } from "../types/graph";

export const readDataset = (): Dataset => useDataStore(pinia).current();
