# Fragment Editing Limitations

## Issue: "e.profiles is not iterable" Error

When trying to edit fragments that were imported from IFC files, you may encounter this error. This document explains why and how to work around it.

## Why This Happens

### Fragment Types

There are two types of fragments in this application:

1. **Basic Fragments** (from IFC Importer)
   - Geometry and visual data only
   - Optimized for viewing and loading
   - Missing IFC entity metadata
   - **Cannot be edited** with advanced features

2. **Full IFC Fragments** (like the example model)
   - Complete IFC entity structure
   - Material definitions
   - Local transform data
   - Representation/profile data
   - **Can be fully edited**

### What's Missing in Basic Fragments

When you import an IFC file through the IFC Importer, it creates a **basic fragment** that contains:
- ✅ 3D geometry (meshes)
- ✅ Visual materials
- ✅ Basic object hierarchy
- ❌ IFC profiles (for parametric editing)
- ❌ Local transforms (for component-level editing)
- ❌ Full material definitions (for material swapping)

The advanced editor (`GeneralEditor` class) requires these missing pieces to perform edits.

## Current Behavior

### What Works ✅
- Loading fragments from library
- Viewing models in 3D
- Camera controls (pan, zoom, rotate)
- Multiple model viewing
- Model management (load, unload, delete)

### What Doesn't Work ❌
- Double-clicking elements to select them for editing
- Transforming individual elements
- Changing materials
- Applying edits and saving to database

## Workarounds

### Option 1: Use Example Model Only

The hardcoded example model (`school_arq.frag`) **DOES work** for editing:

1. Go to `/edit` (without fragment ID)
2. This loads the example model
3. All editing features work
4. Edits save to database with `model_id = "medium_test"`

### Option 2: Import Fragments Differently

To create editable fragments, you need to preserve IFC data during import. This requires modifying the `IfcImporter.js`:

**Current code:**
```javascript
const serializer = new FRAGS.IfcImporter();
// Creates basic geometry-only fragments
```

**Needed code (hypothetical):**
```javascript
const serializer = new FRAGS.IfcImporter();
serializer.settings.preserveProfiles = true;
serializer.settings.preserveTransforms = true;
serializer.settings.fullMaterials = true;
// This would preserve editing capabilities
```

**Note:** The exact API for this may not be available in the current version of `@thatopen/fragments`. Check their documentation.

### Option 3: Use Different File Format

Instead of importing IFC → Fragment → Database, consider:

1. Import IFC → Full Fragment with metadata
2. Save to database with editing capabilities
3. This may require a different serialization approach

## Technical Details

### Where the Error Occurs

```javascript
// In GeneralEditor.init()
const allLtIds = await this._model.getLocalTransformsIds();
const allGeomsIds = await this._model.getRepresentationsIds();
// These methods fail on basic fragments

// In worker when editing
// Tries to iterate over e.profiles which is undefined
// Because basic fragments don't have profile data
```

### Model Structure Comparison

**Example Model (works):**
```javascript
{
  modelId: "medium_test",
  getMaterials: [Function],
  getLocalTransformsIds: [Function],
  getRepresentationsIds: [Function],
  editor: { ... }, // Full editing support
  tiles: { list: Map { ... } }
}
```

**Your Fragment (limited):**
```javascript
{
  modelId: "ff4d8fcb-5f70-...",
  // Missing advanced methods
  object: THREE.Group,
  tiles: undefined or minimal
}
```

## Future Solution

To fully support editing imported IFC files, we need to:

1. **Modify IFC Importer** to preserve IFC metadata
2. **Save full fragments** instead of basic geometry
3. **Check fragment capabilities** before enabling edit features
4. **Provide UI feedback** about which models are editable

### Code Changes Needed

**In IfcImporter.js:**
```javascript
// Add option to preserve IFC data
const serializer = new FRAGS.IfcImporter();
serializer.settings = {
  // ... existing settings
  preserveIFCData: true, // Keep IFC entities
  includeProfiles: true,  // Keep profiles
  fullMetadata: true      // Keep all metadata
};
```

**In Edit.js:**
```javascript
// Check if model is editable before showing edit UI
if (model.supportsEditing()) {
  // Show full editor
} else {
  // Show "View Only" message
}
```

## Recommendations

### For Now

1. **Use `/edit` for testing** - The example model works perfectly
2. **Use `/library` for viewing** - Load and view your imported models
3. **Don't expect editing** on imported IFC files yet

### For Production

To make this work with imported IFC files, you need to:

1. Research `@thatopen/fragments` documentation for advanced import options
2. Modify the IFC import process to preserve metadata
3. Test different IFC files to see which preserve editing data
4. Consider alternative approaches (e.g., edit IFC directly, not fragments)

## Related Files

- `src/pages/Edit.js` - Editor implementation
- `src/pages/IfcImporter.js` - IFC import process
- `src/pages/FragmentLibrary.js` - Fragment management
- `public/worker.mjs` - Fragment processing (where error occurs)

## Questions to Explore

1. Does `@thatopen/fragments` support full IFC editing?
2. Can we serialize IFC files with complete metadata?
3. Is there a different worker configuration needed?
4. Should we use a different editing approach for basic fragments?

## Summary

**Current Status:**
- ✅ Fragment Library works
- ✅ "Start Editing" button added
- ✅ Navigation to Edit page works
- ✅ Fragment loads in Edit page
- ❌ Actual editing doesn't work (missing IFC metadata)

**Why:**
- Imported fragments are geometry-only
- Editor needs full IFC entity structure
- Worker can't process edits without profile data

**Solution:**
- Use example model at `/edit` for now
- Research how to import with full IFC data
- Or build a simpler editor that works with basic geometry

