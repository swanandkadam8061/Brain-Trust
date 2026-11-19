# Brain Trust

Run with Node.js 24 or later:

```sh
node server.mjs
```

Open http://127.0.0.1:8766. The server serves only the workspace assets and the provider gateway. A static file server can display the interface but cannot process model requests.

## Connect models

Set `GROQ_API_KEY`, `OPENROUTER_API_KEY`, or both in the server environment. Alternatively, put the variables in a private environment file outside the web directory and launch with `node --env-file=/absolute/path/to/private.env server.mjs`. Restart after changing credentials. Use **Connections → Refresh catalog** to check the configuration. The previous browser-stored Groq key is no longer used. Clear that site's local storage if you previously chose “Remember on this device.”

OpenRouter supplies multiple model families through its live catalog. A catalog listing does not guarantee account entitlement, region availability, credit balance or upstream capacity. Manual IDs are sent to the selected gateway. Parameters and context limits vary by model. Search, generation, and comparison send the selected conversation context to their respective services. Comparing three models makes three separately billable calls.

## Workspace data

Conversations, attached text, saved prompts, bookmarks, usage records and explicitly saved defaults are stored in this browser at this origin. Export important conversations before clearing browser storage. **Clear conversation history** removes sessions, drafts, bookmarks and attached documents while retaining prompt templates, performance records and preferences. JSON exports contain messages and source links. The PDF export uses the browser's print dialog.

Text PDFs are extracted in the browser using PDF.js loaded on demand from jsDelivr. Other supported text formats require no external parsing library. Image-only PDFs need OCR before upload.

## Vercel

Deploy the project root with the static frontend and the Node function in `api/workspace.mjs`. Set the provider environment variables and `BRAIN_TRUST_PASSWORD` in Vercel, then redeploy. The hosted API uses HTTP Basic authentication with username `studio` and that password. Use HTTPS. The standalone local server binds to loopback. Server-side credentials are never included in the model catalog or client bundle.
