# IFC Importer - Quick Reference Card

## 🚀 Quick Start (3 Steps)

### 1️⃣ Setup Database (One-time)
```sql
-- Copy from IFC_FRAGMENTS_TABLE_SETUP.md and run in Supabase SQL Editor
CREATE TABLE ifc_fragments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  fragment_data TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- (plus indexes and RLS - see full file)
```

### 2️⃣ Navigate to IFC Importer
```
http://localhost:3000/ifc-importer
```

### 3️⃣ Upload & Save
1. Click "Select IFC File"
2. Choose your IFC file
3. Wait for conversion
4. Click "Save to Database"
5. Done! ✅

## 📍 Routes

| Route | Page | Purpose |
|-------|------|---------|
| `/ifc-importer` | IFC Importer | Upload & convert IFC files |
| `/library` | Fragment Library | View & manage saved fragments |
| `/` | Home | Original home page |
| `/edit` | Edit | Original edit page |

## 🎯 Key Features

### IFC Importer Page
- 📤 Upload IFC files
- 🔄 Convert to Fragments
- 👁️ Preview in 3D
- 💾 Save to database
- ⬇️ Download .frag files

### Fragment Library Page
- 📚 List all saved fragments
- ⬆️ Load into scene
- ⬇️ Download fragments
- 🗑️ Delete from database
- 🎨 Multi-model support

## 🛠️ Common Tasks

### Upload an IFC
```
1. Go to /ifc-importer
2. Click "Select IFC File"
3. Choose file
4. Wait for "IFC converted to Fragments!"
```

### Save to Database
```
1. After conversion completes
2. Click "Save to Database"
3. See success message
```

### Load a Saved Fragment
```
1. Go to /library
2. Find your fragment
3. Click "Load"
4. Model appears in scene
```

### Delete a Fragment
```
1. Go to /library
2. Find fragment
3. Click "Delete"
4. Confirm deletion
```

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Error saving to database" | Check Supabase credentials in `.env` |
| Conversion stuck | Check console, wait (large files take time) |
| Model not visible | Check console, adjust camera |
| "Table not found" | Run SQL setup script |

## 📦 File Sizes

| Size | Conversion Time | Performance |
|------|----------------|-------------|
| < 10 MB | Fast (< 30s) | Excellent |
| 10-50 MB | Moderate (30s-2min) | Good |
| 50-100 MB | Slow (2-5min) | Fair |
| > 100 MB | Very slow | Poor (consider alternatives) |

## 🎨 3D Controls

| Action | Control |
|--------|---------|
| Rotate | Left click + drag |
| Pan | Right click + drag |
| Zoom | Mouse wheel |
| Focus | Double click object |

## 📱 Mobile

- ✅ Responsive design
- ✅ Touch controls
- ✅ Menu toggle button
- ⚠️ Performance varies

## 🗂️ Files Created

```
src/
├── common/
│   ├── loadingSpinner.js    ← Reusable component
│   └── loadingSpinner.css
├── pages/
│   ├── IfcImporter.js       ← Main importer
│   ├── IfcImporter.css
│   ├── FragmentLibrary.js   ← Fragment manager
│   └── FragmentLibrary.css
└── App.js                    ← Updated with routes

Docs/
├── IFC_FRAGMENTS_TABLE_SETUP.md  ← Database setup
├── IFC_IMPORTER_GUIDE.md         ← Full guide
├── IFC_FEATURE_SUMMARY.md        ← Implementation details
└── QUICK_REFERENCE.md            ← This file
```

## 💡 Tips

1. **Check Console**: Always open browser console for detailed logs
2. **Start Small**: Test with small IFC files first
3. **Monitor Stats**: Watch FPS/Memory in top-left panel
4. **Save Often**: Save important conversions to database
5. **Download Backups**: Download .frag files as backup

## 🔗 Documentation

- **Full Guide**: `IFC_IMPORTER_GUIDE.md`
- **Database Setup**: `IFC_FRAGMENTS_TABLE_SETUP.md`
- **Implementation**: `IFC_FEATURE_SUMMARY.md`
- **This Reference**: `QUICK_REFERENCE.md`

## ⚡ Performance Tips

1. Unload models when done viewing
2. Don't load too many large models simultaneously
3. Clear all models before loading new batch
4. Monitor memory usage in Stats panel
5. Use smaller IFC files when possible

## 🎓 Next Steps

After basic setup:
1. ✅ Test with sample IFC file
2. ✅ Verify database save works
3. ✅ Test loading from library
4. ✅ Try multi-model loading
5. ✅ Test on mobile device

## 📞 Need Help?

1. Check `IFC_IMPORTER_GUIDE.md` - Comprehensive guide
2. Check browser console - Detailed error messages
3. Check `IFC_FRAGMENTS_TABLE_SETUP.md` - Database issues
4. Check Supabase dashboard - Verify table exists

## ✨ You're Ready!

Everything is set up and ready to use. Since your app is already running, the new pages should be accessible immediately through the navigation menu!

**Happy modeling! 🏗️**

