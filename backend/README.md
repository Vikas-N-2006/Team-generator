# InterHostel Team Builder - Backend

## Run locally

1. Create virtualenv and install requirements:
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Run the server:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

The backend exposes:
- POST /api/parse-multiple (files multipart) -> returns categories A/B/C
- POST /api/parse-single (file multipart) -> splits single PDF into 3 categories
- POST /api/generate-teams (json) -> accepts { categories, options, seed } and returns teams
