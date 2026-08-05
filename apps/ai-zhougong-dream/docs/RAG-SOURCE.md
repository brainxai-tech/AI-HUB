# RAG Source Decision

## Choice

Use Wikisource `周公解梦` as the primary local RAG source.

Source URL:
`https://zh.wikisource.org/wiki/周公解夢`

Raw import URL:
`https://zh.wikisource.org/w/index.php?title=周公解夢&action=raw`

## Why This Source

- It exposes the text as MediaWiki raw wikitext, which can be parsed reproducibly.
- The text is organized into traditional categories, which are useful metadata for retrieval.
- The source has clear Wikisource attribution and license expectations.
- It is more suitable for automated ingestion than commercial SEO dream-dictionary pages.

## Secondary Reference

The Chinese Text Project page can be used for manual comparison, but it is not the default automated ingestion source because the project should avoid depending on scraping a site with stricter download and usage boundaries.

## Implementation

Run:

```bash
npm run rag:build
```

This generates `server/rag/zhougongCorpus.generated.ts`.

At runtime:

1. `retrieveZhougongContext(dreamText)` normalizes the dream text.
2. It scores local corpus entries using dream-image concept rules and n-gram overlap.
3. It returns concrete `ragCitations`.
4. `buildDreamPrompt()` injects those citations before model generation.
5. The server attaches the same citations to `DreamInterpretResult.ragCitations`.

The model is not allowed to invent source lines; citations come from the server-side retriever.
