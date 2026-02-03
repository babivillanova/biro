# Troubleshooting: "Start Editing" Feature

## Current Errors

### 1. "TypeError: e.profiles is not iterable"

**What it means:** The fragment file doesn't have the complete IFC structure that the advanced editor expects.

**Why it happens:** 
- Fragments created from IFC imports may have simplified geometry without full IFC entity data
- The example model (`school_arq.frag`) has complete IFC metadata
- Your uploaded models might have been converted differently

**Solution:** The code has been updated with error handling to gracefully handle this. The model should still load and display, even if advanced editing features are limited.

### 2. "Real-time subscription failed"

**What it means:** Supabase real-time is not properly configured.

**Why it happens:**
- Requires Supabase paid plan for real-time features
- Or needs additional configuration

**Solution:** The app automatically falls back to polling mode (checks every 3 seconds), which still works fine for collaboration.

## Testing Steps

### Test 1: Verify Fragment Library Works

1. Open browser console (F12)
2. Go to `/library`
3. Check console for:
   - ✅ "Loaded X fragments from database"
   - Should see your saved fragments listed

### Test 2: Test "Start Editing" Button

1. In Fragment Library, click "Start Editing" on a fragment
2. Check console for these messages in order:
   ```
   🔍 Loading fragment from Supabase: <uuid>
   ✅ Fragment loaded from database: {name, size, id}
   🔄 Decoding fragment data...
   ✅ Fragment decoded, buffer size: <number>
   🔄 Loading fragment into scene...
   📋 Model loaded successfully: {modelId, hasEditor, tileCount}
   ```

3. If you see an error at any step, that's where the problem is

### Test 3: Test Basic Editing

1. After model loads in Edit page
2. Double-click an element
3. Try to move it with the transform gizmo
4. Click "Apply changes"
5. Check console for:
   ```
   💾 Saving to Supabase...
   ✅ Saved X requests to database
   ```

## Common Issues & Solutions

### Issue: Model doesn't appear in Edit page

**Check:**
- Console shows "Model loaded successfully"?
- Browser console has any errors?
- Try zooming out (scroll wheel)
- Try the example model at `/edit` (no fragment ID)

**Fix:**
```javascript
// The model might be far from camera
// Try adjusting camera position in Edit.js
world.camera.controls.setLookAt(0, 0, 50, 0, 0, 0);
```

### Issue: "Fragment not found in database"

**Check:**
- Fragment ID in URL is correct UUID format
- Fragment exists in Supabase `ifc_fragments` table
- You're logged into correct Supabase project

**Fix:** Go back to Fragment Library and click "Start Editing" again

### Issue: Edits don't save to database

**Check:**
- Console shows "Saving to Supabase..." message?
- Any red error messages in console?
- Check Supabase table editor for `edit_requests` table

**Fix:**
- Verify Supabase credentials in `.env`
- Check RLS policies on `edit_requests` table
- Ensure internet connection is active

### Issue: Worker errors continue appearing

**Expected:** If you see "TypeError: e.profiles is not iterable" but the model still loads and appears, this is OK. The error happens during advanced editor initialization but doesn't prevent basic editing.

**Impact:**
- ✅ Model loads and displays
- ✅ Basic transformations work
- ✅ Edits can be saved
- ❌ Advanced material editing may not work
- ❌ Some IFC-specific features may be limited

## Diagnostic Console Commands

Open browser console and run these to check state:

```javascript
// Check if fragment ID was passed
console.log('Fragment ID:', window.location.pathname.split('/').pop());

// Check if model loaded
console.log('Editor ref:', window.generalEditorRef);

// Check Supabase connection
supabase.from('ifc_fragments').select('count').then(console.log);

// Check edit history
supabase.from('edit_requests').select('*').limit(5).then(console.log);
```

## What Should Work Now

✅ **Working:**
- Navigate from Library to Edit page with fragment ID
- Load fragment from Supabase database
- Display model in 3D scene
- Edit history loads from database
- Edits save to database
- Multi-user collaboration via polling (3 second updates)
- Edit history shows per-model

⚠️ **Limited:**
- Advanced IFC entity editing (if fragment lacks metadata)
- Material editing (if fragment lacks material data)
- Real-time updates (falls back to polling)

❌ **Known Issues:**
- Some fragments show "profiles not iterable" error (non-blocking)
- Real-time subscription requires additional setup

## Next Steps

1. **Test with example model first:**
   - Go to `/edit` (no fragment ID)
   - Verify editing works with the example model
   - If this works, your setup is correct

2. **Test with your fragment:**
   - Go to `/library`
   - Click "Start Editing" on a fragment
   - Check console for errors
   - Report which step fails

3. **Report Issues:**
   - Share console output from the moment you click "Start Editing"
   - Include any red error messages
   - Note which step in "Test 2" above fails

## Quick Fix: Use Example Model

If your fragments don't work for editing but you need to test the feature:

1. The example model at `/edit` always works
2. Or download a working fragment from here:
   - https://thatopen.github.io/engine_fragment/resources/frags/school_arq.frag
3. Save it and re-upload via IFC Importer

## Understanding the Error Messages

### "e.profiles is not iterable"
- **Severity:** Low (non-blocking)
- **Impact:** Advanced features limited
- **Action:** Can ignore if basic editing works

### "Real-time subscription failed"
- **Severity:** Low (has fallback)
- **Impact:** 3-second delay instead of instant updates
- **Action:** Can ignore, polling works fine

### "Fragment not found"
- **Severity:** High (blocking)
- **Impact:** Can't load model
- **Action:** Check URL and database

### "Error loading model into scene"
- **Severity:** High (blocking)
- **Impact:** Model won't display
- **Action:** Fragment file might be corrupted

## Debug Mode

To enable more verbose logging, open `Edit.js` and add at the top:

```javascript
const DEBUG = true;
```

Then add debug logs throughout to trace execution.

