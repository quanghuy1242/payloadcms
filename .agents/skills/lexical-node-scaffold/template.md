# Lexical Node Scaffold Template

## Node

- Feature name (kebab-case): 
- Node class name: `<Name>Node`
- Serialized type extra fields: 

## Files to create

- `src/features/<name>/feature.server.ts`
- `src/features/<name>/feature.client.ts`
- `src/features/<name>/nodes/<Name>Node.tsx`
- `src/features/<name>/components/<Name>Component.tsx`
- `src/features/<name>/plugin/index.tsx`
- `src/features/<name>/icons/<Name>Icon.tsx` (optional)

## Node contract

- `static getType()` returns:
- Extra fields in `SerializedType`:
- HTML converter output:

## Registration

- Add to `src/payload.config.ts` features array: `<Name>Feature()`
- Add to `src/utils/chapterLexicalNodes.ts` if used in EPUB imports: yes / no
