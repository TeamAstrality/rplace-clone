# r/place Clone 🎨

A simple multiplayer pixel canvas inspired by Reddit's r/place.

## ⚙️ Setup

### 1. Database (Supabase)
- Go to https://supabase.com and make a new project.
- Run this SQL in the SQL Editor:

```sql
create table if not exists pixels (
  x int,
  y int,
  color text,
  updated_at timestamp default now(),
  primary key (x, y)
);
alter publication supabase_realtime add table pixels;
