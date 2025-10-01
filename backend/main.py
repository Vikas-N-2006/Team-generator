from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import os
from utils.parser import extract_categories
from utils.team_logic import form_teams
from utils.exporter import export_teams_pdf

app = FastAPI()

# Allow frontend (React) to call backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/upload")
async def upload_file(file: UploadFile):
    file_path = f"temp_{file.filename}"
    with open(file_path, "wb") as f:
        f.write(await file.read())

    categories = extract_categories(file_path)
    teams = form_teams(categories)
    os.remove(file_path)
    return {"teams": teams}

@app.post("/download")
async def download_pdf(file: UploadFile):
    file_path = f"temp_{file.filename}"
    with open(file_path, "wb") as f:
        f.write(await file.read())

    categories = extract_categories(file_path)
    teams = form_teams(categories)
    pdf_file = export_teams_pdf(teams)
    os.remove(file_path)

    return FileResponse(pdf_file, media_type="application/pdf", filename="teams.pdf")
