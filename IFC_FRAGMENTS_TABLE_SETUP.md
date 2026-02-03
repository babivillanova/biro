# IFC Fragments Database Table Setup

This document describes how to set up the database table for storing IFC fragment data in Supabase.

## Table Schema

Create a table named `ifc_fragments` in your Supabase database with the following structure:

### SQL Script

Run this SQL in your Supabase SQL Editor:

```sql
-- Create the ifc_fragments table
CREATE TABLE IF NOT EXISTS ifc_fragments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  fragment_data TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add an index on the name for faster searching
CREATE INDEX IF NOT EXISTS idx_ifc_fragments_name ON ifc_fragments(name);

-- Add an index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_ifc_fragments_created_at ON ifc_fragments(created_at DESC);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to call the function before any update
CREATE TRIGGER update_ifc_fragments_updated_at 
  BEFORE UPDATE ON ifc_fragments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (optional but recommended)
ALTER TABLE ifc_fragments ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow all operations for authenticated users
-- Adjust this according to your security requirements
CREATE POLICY "Allow all operations for authenticated users" 
  ON ifc_fragments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- If you want to allow anonymous access (adjust as needed):
-- CREATE POLICY "Allow public read access" 
--   ON ifc_fragments
--   FOR SELECT
--   USING (true);

-- CREATE POLICY "Allow public insert" 
--   ON ifc_fragments
--   FOR INSERT
--   WITH CHECK (true);
```

## Table Structure

| Column         | Type      | Description                                    |
|----------------|-----------|------------------------------------------------|
| id             | UUID      | Primary key, auto-generated                    |
| name           | TEXT      | Name of the IFC model                          |
| fragment_data  | TEXT      | Base64-encoded fragment binary data            |
| file_size      | BIGINT    | Size of the fragment file in bytes             |
| created_at     | TIMESTAMP | Timestamp when the record was created          |
| updated_at     | TIMESTAMP | Timestamp when the record was last updated     |

## How to Set Up

1. Go to your Supabase project dashboard
2. Click on "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy and paste the SQL script above
5. Click "Run" to execute the script

## Usage in the Application

The IFC Importer page will:
1. Convert IFC files to Fragments binary format
2. Encode the binary data as Base64
3. Store it in the `ifc_fragments` table with metadata

## Querying Fragments

To retrieve all fragments:
```javascript
const { data, error } = await supabase
  .from('ifc_fragments')
  .select('*')
  .order('created_at', { ascending: false });
```

To retrieve a specific fragment by name:
```javascript
const { data, error } = await supabase
  .from('ifc_fragments')
  .select('*')
  .eq('name', 'your-model-name')
  .single();
```

To load fragment data:
```javascript
// Decode Base64 back to ArrayBuffer
const binaryString = atob(data.fragment_data);
const bytes = new Uint8Array(binaryString.length);
for (let i = 0; i < binaryString.length; i++) {
  bytes[i] = binaryString.charCodeAt(i);
}
const arrayBuffer = bytes.buffer;

// Load into fragments manager
await fragments.load(arrayBuffer, { modelId: data.id });
```

## Storage Considerations

⚠️ **Important Notes:**

1. **Large Files**: Fragment files can be large (10-100+ MB). PostgreSQL TEXT columns can handle this, but for very large models (>100 MB), consider using Supabase Storage instead.

2. **Alternative: Using Supabase Storage**:
   If you need to store very large fragments, modify the table to store a file URL instead:
   ```sql
   ALTER TABLE ifc_fragments 
   ADD COLUMN storage_path TEXT,
   DROP COLUMN fragment_data;
   ```
   
   Then upload to Supabase Storage:
   ```javascript
   const { data, error } = await supabase.storage
     .from('fragments')
     .upload(`${modelName}.frag`, fragmentBytes);
   ```

3. **Performance**: For production use, consider:
   - Implementing pagination for large lists
   - Adding more metadata fields (author, description, tags, etc.)
   - Implementing soft delete instead of hard delete
   - Adding thumbnail images for preview

## Security

The provided SQL includes Row Level Security (RLS) policies. Adjust these according to your needs:

- **Public Access**: Allows anyone to read/write (good for testing, not for production)
- **Authenticated Only**: Requires users to be logged in
- **Custom Policies**: Add user-specific policies based on your requirements

## Next Steps

After setting up the table:
1. Test by uploading an IFC file in the IFC Importer page
2. Verify data is stored correctly in Supabase Table Editor
3. Implement a page to list and load saved fragments
4. Add search/filter functionality

