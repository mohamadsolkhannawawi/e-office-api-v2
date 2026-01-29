import { app } from "../src/server.ts";

export default function handler(request: Request) {
    return app.handle(request);
}
