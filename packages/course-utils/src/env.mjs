import { config } from "dotenv";

const rootEnvPath = new URL("../../../.env", import.meta.url);

config({ path: rootEnvPath });
