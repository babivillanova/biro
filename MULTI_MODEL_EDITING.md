# Multi-Model Editing Feature

## Overview

The application now supports editing multiple models from the Fragment Library. Each model's edits are tracked separately in Supabase.

## What Changed

### 1. **Fragment Library - "Start Editing" Button Added**

**File: `src/pages/FragmentLibrary.js`**

- Added `useNavigate` hook from react-router-dom
- Added `startEditing()` function that navigates to `/edit/{fragmentId}`
- Added "Start Editing" button for each fragment in the library
- Button appears alongside Load, Download, and Delete buttons

### 2. **App Routing - Dynamic Route Added**

**File: `src/App.js`**

- Added new route: `/edit/:fragmentId` to accept a fragment ID parameter
- Kept original `/edit` route for the example model
- Both routes render the same `<Edit />` component

### 3. **Edit Page - Dynamic Model Loading**

**File: `src/pages/Edit.js`**

- Added `useParams` hook to read `fragmentId` from URL
- Modified model loading logic to be conditional:
  - **If fragmentId exists**: Load model from Supabase database
  - **If no fragmentId**: Load the example model (school_arq.frag)
- Uses fragment ID as model ID for database tracking

## How It Works

### User Workflow

```
1. User goes to Fragment Library (/library)
2. Sees list of saved fragments
3. Clicks "Start Editing" on a fragment
4. Navigates to /edit/{fragmentId}
5. Edit page loads that specific model from Supabase
6. User makes edits
7. Edits are saved to database with that model's ID
```

### Data Flow

```
FragmentLibrary.js
    ↓
  "Start Editing" clicked
    ↓
navigate(`/edit/${fragmentId}`)
    ↓
Edit.js receives fragmentId
    ↓
Load fragment from Supabase
    ↓
Decode Base64 → ArrayBuffer
    ↓
Load into Fragments with modelId = fragmentId
    ↓
User edits element
    ↓
Apply changes → Save to database
    ↓
Saved with model_id = fragmentId
```

### Database Structure

All edits are stored in the `edit_requests` table with the `model_id` field:

```sql
edit_requests
├── id                UUID
├── model_id          TEXT  ← Fragment ID (unique per model)
├── request_type      INTEGER
├── local_id          TEXT
├── request_data      JSONB
├── user_id           TEXT
├── created_at        TIMESTAMP
├── is_undone         BOOLEAN
└── sequence_order    INTEGER
```

### Real-Time Collaboration

- Each model has its own edit history
- Real-time subscription filters by `model_id`
- Multiple users can edit the **same model** simultaneously
- Multiple users can edit **different models** simultaneously
- Edit history is isolated per model

## Usage Examples

### Editing Your Own Model

1. Import an IFC file via `/ifc-importer`
2. Go to `/library`
3. Click "Start Editing" on your model
4. Make changes
5. Click "Apply changes"
6. Edits are saved to Supabase with your model's ID

### Editing the Example Model

1. Go to `/edit` (no fragment ID)
2. Edit the hardcoded example model
3. Edits saved with `model_id = "medium_test"`

### Viewing Edit History

- Edit history in the panel shows only edits for the current model
- Each user's edits are color-coded by their IP address
- Timestamp and user info displayed for each edit

## Benefits

✅ **Multiple Models Supported**: Edit any model from your library
✅ **Isolated Edit History**: Each model has its own edit timeline
✅ **Backward Compatible**: Example model still works at `/edit`
✅ **Database Ready**: No schema changes needed - already supported
✅ **Real-Time Sync**: Multi-user collaboration works per model
✅ **Clean Architecture**: Model ID automatically matches fragment ID

## Testing

### Test Scenario 1: Edit Your Own Model
```
1. Go to /ifc-importer
2. Upload an IFC file
3. Save to database
4. Go to /library
5. Click "Start Editing"
6. Verify correct model loads
7. Make an edit and apply
8. Check console for "model_id: <your-fragment-id>"
```

### Test Scenario 2: Multiple Models
```
1. Upload 2 different IFC files
2. Edit Model A, apply changes
3. Edit Model B, apply changes
4. Go back to Model A
5. Verify only Model A's edits appear in history
6. Go back to Model B
7. Verify only Model B's edits appear in history
```

### Test Scenario 3: Multi-User on Same Model
```
1. User A: Open Model X at /edit/{X-id}
2. User B: Open Model X at /edit/{X-id}
3. User A: Make edit and apply
4. User B: Should see edit appear in real-time
5. Both see same edit history
```

## Code Changes Summary

| File | Lines Changed | Type |
|------|---------------|------|
| `App.js` | 1 | Added route |
| `FragmentLibrary.js` | 6 | Added button + navigation |
| `Edit.js` | 40 | Conditional model loading |

## Future Enhancements

Possible improvements:
- Display model name in Edit page header
- Add "Back to Library" button in Edit page
- Show thumbnail preview of model being edited
- Add model metadata panel (file size, upload date, etc.)
- Support editing multiple versions of same model
- Add model comparison view (before/after edits)

## Troubleshooting

### Model Doesn't Load
- Check fragment ID is valid UUID
- Verify fragment exists in Supabase `ifc_fragments` table
- Check browser console for error messages
- Ensure Supabase credentials are configured

### Edits Not Saving
- Check `model_id` in console logs
- Verify `edit_requests` table has RLS policies enabled
- Check network tab for Supabase API errors
- Ensure real-time is enabled on `edit_requests` table

### Wrong Edit History Shows
- Verify URL shows correct fragment ID
- Check browser console for model ID being used
- Refresh page to reload from database
- Check Supabase table editor for correct `model_id` values

