from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pdfplumber
import pytesseract
from PIL import Image
import io, re, math, random
from typing import List, Dict, Any

app = FastAPI(title='InterHostel Team Builder Backend')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

NAME_LINE_REGEX = re.compile(r'^[\d\s\.-]*([A-Za-z][A-Za-z\s\'"`.-]{1,})$')

def clean_lines(text: str) -> List[str]:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    names = []
    for line in lines:
        # remove numbering like "1. Name" or "1) Name"
        line2 = re.sub(r'^[\d\s\.-]+', '', line)
        # remove bullets
        line2 = re.sub(r'^[\u2022\-\*\s]+', '', line2)
        if len(line2) >= 2:
            names.append(line2.strip())
    return names

def extract_text_from_pdf_bytes(content: bytes) -> str:
    text = ''
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ''
                text += page_text + '\n--PAGE--\n'
    except Exception:
        text = ''
    return text

def ocr_image_from_pdf_bytes(content: bytes) -> str:
    try:
        img = Image.open(io.BytesIO(content))
        return pytesseract.image_to_string(img)
    except Exception:
        return ''

@app.post('/api/parse-multiple')
async def parse_multiple(files: List[UploadFile] = File(...)):
    # expects up to 3 files, will map them to A,B,C in order uploaded or by filename containing A/B/C
    categories = {'A': [], 'B': [], 'C': []}
    for idx, up in enumerate(files[:3]):
        try:
            b = await up.read()
            text = extract_text_from_pdf_bytes(b)
            if not text.strip():
                text = ocr_image_from_pdf_bytes(b)
            names = clean_lines(text)
            key = 'A' if idx==0 else ('B' if idx==1 else 'C')
            categories[key] = names
        except Exception as e:
            categories[key] = []
    return {'categories': categories}

@app.post('/api/parse-single')
async def parse_single(file: UploadFile = File(...)):
    b = await file.read()
    text = extract_text_from_pdf_bytes(b)
    if not text.strip():
        text = ocr_image_from_pdf_bytes(b)
    # Heuristic: try to split into 3 sections by headings
    # Look for lines in ALL CAPS or lines containing 'Category' or 'Hostel' or similar
    lines = [l for l in text.splitlines() if l.strip()]
    header_idx = []
    for i,l in enumerate(lines):
        if re.search(r'CATEGORY|HOSTEL|GROUP|SECTION|^A\b|^B\b|^C\b', l.upper()):
            header_idx.append(i)
    if len(header_idx) >= 3:
        # split at first 3 headers
        sections = []
        for i in range(3):
            start = header_idx[i]
            end = header_idx[i+1] if i+1 < len(header_idx) else len(lines)
            sections.append('\n'.join(lines[start+1:end]))
    else:
        # fallback: split pages (we had --PAGE-- markers)
        pages = text.split('\n--PAGE--\n')
        if len(pages) >= 3:
            # group pages into 3 roughly equal groups
            n = len(pages)
            per = math.ceil(n/3)
            sections = ['\n'.join(pages[i*per:(i+1)*per]) for i in range(3)]
        else:
            # last resort: split lines into 3 equal parts
            n = len(lines)
            if n==0:
                sections = ['', '', '']
            else:
                per = max(1, math.ceil(n/3))
                sections = ['\n'.join(lines[i*per:(i+1)*per]) for i in range(3)]
    categories = {}
    for idx, key in enumerate(['A','B','C']):
        categories[key] = clean_lines(sections[idx]) if sections[idx] else []
    return {'categories': categories}

def generate_teams_algo(input_categories: Dict[str, List[str]], options: Dict[str, Any], seed: int = None):
    # copy and shuffle
    rnd = random.Random(seed)
    lists = {k: list(v) for k,v in input_categories.items()}
    for k in lists:
        rnd.shuffle(lists[k])

    team_size = int(options.get('teamSize', 3))
    strategy = options.get('twoCategoryStrategy', 'larger')
    allow_incomplete = bool(options.get('allowIncompleteTeams', True))

    teams = []
    incomplete = 0
    alternate_toggle = 0

    def pop_from(k):
        return lists[k].pop() if lists[k] else None
    def remaining_count():
        return sum(len(lists[k]) for k in lists)
    def non_empty_keys():
        return [k for k in ['A','B','C'] if len(lists[k])>0]

    while remaining_count() > 0:
        keys = non_empty_keys()
        if len(keys) == 3:
            if all(len(lists[k])>=1 for k in ['A','B','C']):
                team = [pop_from('A'), pop_from('B'), pop_from('C')]
                teams.append([x for x in team if x])
                continue
        if len(keys) == 2:
            k1, k2 = keys[0], keys[1]
            total = len(lists[k1]) + len(lists[k2])
            if total < team_size:
                team = []
                while lists[k1]: team.append(pop_from(k1))
                while lists[k2]: team.append(pop_from(k2))
                if team:
                    if len(team) == team_size or allow_incomplete:
                        teams.append(team); incomplete += (1 if len(team)<team_size else 0)
                break
            extra = k1
            if strategy == 'larger':
                extra = k1 if len(lists[k1])>=len(lists[k2]) else k2
            elif strategy == 'random':
                extra = k1 if rnd.random() < 0.5 else k2
            elif strategy == 'alternate':
                extra = k1 if (alternate_toggle%2)==0 else k2
                alternate_toggle += 1
                if len(lists[extra])==0:
                    extra = k1 if extra==k2 else k2
            team = []
            a = pop_from(k1); b = pop_from(k2)
            if a: team.append(a)
            if b: team.append(b)
            if lists[extra]: team.append(pop_from(extra))
            elif lists[k1]: team.append(pop_from(k1))
            elif lists[k2]: team.append(pop_from(k2))
            if len(team)==team_size:
                teams.append(team)
            else:
                if allow_incomplete and team:
                    teams.append(team); incomplete += 1
                break
            continue
        if len(keys) == 1:
            k = keys[0]
            avail = len(lists[k])
            if avail >= team_size:
                team = [pop_from(k) for _ in range(team_size)]
                teams.append([x for x in team if x])
                continue
            else:
                team = []
                while lists[k]: team.append(pop_from(k))
                if team:
                    if len(team)==team_size:
                        teams.append(team)
                    else:
                        if allow_incomplete:
                            teams.append(team); incomplete +=1
                break
    return teams, incomplete

@app.post('/api/generate-teams')
async def generate_teams(payload: Dict[str, Any]):
    try:
        categories = payload.get('categories', {})
        options = payload.get('options', {})
        seed = payload.get('seed', None)
        teams, incomplete = generate_teams_algo(categories, options, seed)
        return JSONResponse({'teams': teams, 'meta': {'incompleteTeams': incomplete, 'seedUsed': seed}})
    except Exception as e:
        return JSONResponse({'error': str(e)}, status_code=500)

@app.get('/api/health')
def health():
    return {'status':'ok'}
