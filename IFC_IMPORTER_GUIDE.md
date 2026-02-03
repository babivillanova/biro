# IFC Importer Feature Guide

## Overview

The IFC Importer feature allows you to convert IFC (Industry Foundation Classes) files into lightweight Fragment format and store them in your Supabase database. This enables efficient BIM (Building Information Modeling) data management and visualization.

## Features

### 1. **IFC Importer Page** (`/ifc-importer`)
- Upload and convert IFC files to Fragments
- Preview converted models in 3D
- Save fragments to database
- Download fragment files locally
- Real-time conversion progress tracking

### 2. **Fragment Library Page** (`/library`)
- View all saved fragments from database
- Load/unload models in 3D scene
- Download saved fragments
- Delete fragments from database
- Manage multiple models simultaneously

## Getting Started

### Step 1: Set Up the Database

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy the SQL script from `IFC_FRAGMENTS_TABLE_SETUP.md`
4. Run the script to create the `ifc_fragments` table

### Step 2: Configure Environment Variables

Make sure your `.env` file contains:
```
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_anon_key
```

### Step 3: Start Using the Feature

Since you mentioned your app is always running, the new pages should be immediately available:
- Navigate to `/ifc-importer` to upload and convert IFC files
- Navigate to `/library` to view and manage saved fragments

## How to Use

### Converting an IFC File

1. **Navigate to IFC Importer**
   - Click "IFC Importer" in the navigation menu
   - Or go to: `http://localhost:3000/ifc-importer`

2. **Upload IFC File**
   - Click "Select IFC File" button
   - Choose an IFC file from your computer
   - Wait for conversion (progress shown in console and loading spinner)

3. **Preview the Model**
   - Once converted, click "Add Model to Scene"
   - The 3D model will load in the viewer
   - Use mouse to rotate, zoom, and pan:
     - Left click + drag: Rotate
     - Right click + drag: Pan
     - Scroll wheel: Zoom

4. **Save to Database**
   - Click "Save to Database" button
   - The fragment will be stored in Supabase
   - You'll see a success message

5. **Download Locally (Optional)**
   - Click "Download Fragments" to save the .frag file locally

6. **Convert Another File**
   - Click "Convert Another IFC" to start over

### Managing Saved Fragments

1. **Navigate to Library**
   - Click "Library" in the navigation menu
   - Or go to: `http://localhost:3000/library`

2. **View Saved Fragments**
   - All saved fragments are listed with:
     - Name
     - File size
     - Creation date

3. **Load a Fragment**
   - Click "Load" button next to any fragment
   - The model will appear in the 3D scene
   - You can load multiple models at once

4. **Unload a Fragment**
   - Click "Unload" button to remove from scene
   - The fragment remains in the database

5. **Download a Fragment**
   - Click "Download" to get the .frag file

6. **Delete a Fragment**
   - Click "Delete" to permanently remove from database
   - Confirmation dialog will appear

7. **Clear All Models**
   - Click "Clear All Models" to remove all loaded models from scene
   - Fragments remain in the database

## File Structure

```
biro/src/
├── common/
│   ├── loadingSpinner.js      # Reusable loading spinner component
│   └── loadingSpinner.css     # Spinner styles
├── pages/
│   ├── IfcImporter.js         # IFC upload and conversion page
│   ├── IfcImporter.css        # IFC importer styles
│   ├── FragmentLibrary.js     # Fragment management page
│   └── FragmentLibrary.css    # Library styles
└── App.js                      # Updated with new routes
```

## Technical Details

### IFC Conversion Process

1. **File Reading**: IFC file is read as ArrayBuffer
2. **Web-IFC Processing**: Uses web-ifc@0.0.72 WASM for parsing
3. **Fragment Generation**: Converts to optimized Fragment format
4. **Base64 Encoding**: Binary data encoded for database storage

### Database Schema

The `ifc_fragments` table stores:
- `id`: UUID primary key
- `name`: Model name (from filename)
- `fragment_data`: Base64-encoded binary data
- `file_size`: Size in bytes
- `created_at`: Timestamp
- `updated_at`: Timestamp (auto-updated)

### Fragment Loading

1. **Database Retrieval**: Fetch fragment from Supabase
2. **Base64 Decoding**: Convert back to ArrayBuffer
3. **Fragment Loading**: Load into @thatopen/fragments manager
4. **Scene Integration**: Add to Three.js scene

## Performance Considerations

### File Size Limits

- **Small Models** (< 10 MB): Fast conversion and loading
- **Medium Models** (10-50 MB): Moderate conversion time
- **Large Models** (50-100 MB): Longer conversion, may take 1-5 minutes
- **Very Large Models** (> 100 MB): Consider splitting or using Supabase Storage

### Optimization Tips

1. **Memory Management**
   - Unload models when not needed
   - Clear all models before loading many new ones
   - The Stats.js panel shows memory usage

2. **Database Storage**
   - For very large models, consider using Supabase Storage instead of table storage
   - See `IFC_FRAGMENTS_TABLE_SETUP.md` for Storage implementation

3. **Scene Performance**
   - Loading multiple large models may impact performance
   - Use the Stats panel (top-left) to monitor FPS and memory

## Common Issues & Solutions

### Issue: "Error saving to database"

**Possible Causes:**
- Supabase not configured
- RLS policies too restrictive
- Network issues

**Solutions:**
1. Check `.env` file has correct credentials
2. Verify RLS policies in Supabase
3. Check browser console for detailed error

### Issue: Conversion takes too long

**Solutions:**
1. Check file size (large IFCs take longer)
2. Monitor console for progress
3. Ensure good internet connection (WASM loads from CDN)

### Issue: Model doesn't appear after loading

**Solutions:**
1. Check browser console for errors
2. Try adjusting camera position
3. Ensure fragment data is valid
4. Check Three.js scene in React DevTools

### Issue: "Table not found" error

**Solution:**
1. Run the SQL setup script from `IFC_FRAGMENTS_TABLE_SETUP.md`
2. Verify table exists in Supabase dashboard

## Browser Compatibility

- ✅ Chrome/Edge (Recommended)
- ✅ Firefox
- ✅ Safari (macOS/iOS)
- ⚠️ Older browsers may have WASM compatibility issues

## Mobile Support

- Responsive design for mobile devices
- Touch controls for 3D navigation
- Menu toggler button for smaller screens
- May have performance limitations with large models

## Keyboard Shortcuts

While in the 3D viewer:
- **Double-click**: Focus on object
- **Mouse wheel**: Zoom in/out
- **Left mouse + drag**: Rotate view
- **Right mouse + drag**: Pan view

## Next Steps

### Suggested Enhancements

1. **Add Search/Filter**: Search fragments by name or date
2. **Add Thumbnails**: Generate preview images for each fragment
3. **Add Metadata**: Store additional model information
4. **Add Sharing**: Share fragments with other users
5. **Add Export**: Export to other formats
6. **Add Measurements**: Add measurement tools to viewer
7. **Add Annotations**: Allow users to add notes to models

### Example Extensions

Check the tutorial you provided for additional features:
- Property extraction
- Element selection
- Section planes
- Clipping planes
- Measurement tools

## Resources

- [@thatopen/fragments Documentation](https://thatopen.github.io/engine_fragment/)
- [@thatopen/components Documentation](https://thatopen.github.io/engine_components/)
- [Supabase Documentation](https://supabase.com/docs)
- [Web-IFC Documentation](https://ifcjs.github.io/info/)

## Support

If you encounter issues:
1. Check browser console for errors
2. Verify Supabase configuration
3. Check the worker.mjs file exists in `/public`
4. Review the setup documentation files

## License

This feature uses:
- @thatopen/fragments (check their license)
- @thatopen/components (check their license)
- @thatopen/ui (check their license)
- web-ifc (check their license)

