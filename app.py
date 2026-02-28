from flask import Flask, render_template, request, jsonify
import sqlite3
from pathlib import Path
import re
from collections import Counter
import numpy as np
import pandas as pd

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans

app = Flask(__name__)
DB_PATH = Path("tdwi.db")


# -----------------------------
# DB helper
# -----------------------------
def query_db(sql, params=()):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(sql, params)
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


# -----------------------------
# Home
# -----------------------------
@app.route("/")
def index():
    years = query_db("""
        SELECT DISTINCT year
        FROM sessions
        WHERE year IS NOT NULL
        ORDER BY year
    """)
    years = [y["year"] for y in years]

    speakers = query_db("""
        SELECT DISTINCT name
        FROM speakers
        WHERE name IS NOT NULL AND TRIM(name) <> ''
        ORDER BY name
    """)
    companies = query_db("""
        SELECT DISTINCT company
        FROM speakers
        WHERE company IS NOT NULL AND TRIM(company) <> ''
        ORDER BY company
    """)

    speakers = [s["name"] for s in speakers]
    companies = [c["company"] for c in companies]

    return render_template("index.html", years=years, speakers=speakers, companies=companies)


# -----------------------------
# Speakers page
# -----------------------------
@app.route("/speakers")
def speakers_page():
    years = query_db("""
        SELECT DISTINCT year
        FROM sessions
        WHERE year IS NOT NULL
        ORDER BY year
    """)
    years = [y["year"] for y in years]
    return render_template("speakers.html", years=years)


# Speaker count per year 
@app.route("/api/speaker_count")
def api_speaker_count():
    name = request.args.get("name", "").strip()
    year = request.args.get("year", "").strip()

    if not name:
        return jsonify([])

    if year:
        sql = """
        SELECT s.year, COUNT(*) AS talks
        FROM speakers sp
        JOIN sessions s ON sp.session_uid = s.session_uid
        WHERE LOWER(TRIM(sp.name)) = LOWER(TRIM(?))
          AND s.year = ?
        GROUP BY s.year
        ORDER BY s.year
        """
        rows = query_db(sql, (name, year))
    else:
        sql = """
        SELECT s.year, COUNT(*) AS talks
        FROM speakers sp
        JOIN sessions s ON sp.session_uid = s.session_uid
        WHERE LOWER(TRIM(sp.name)) = LOWER(TRIM(?))
        GROUP BY s.year
        ORDER BY s.year
        """
        rows = query_db(sql, (name,))

    return jsonify(rows)


# Top speakers 
@app.route("/api/top_speakers")
def api_top_speakers():
    year = request.args.get("year", "").strip()
    limit = int(request.args.get("limit", 20))

    if year:
        sql = """
        SELECT sp.name, COUNT(*) AS talks
        FROM speakers sp
        JOIN sessions s ON sp.session_uid = s.session_uid
        WHERE s.year = ?
          AND sp.name IS NOT NULL
          AND TRIM(sp.name) <> ''
        GROUP BY LOWER(TRIM(sp.name))
        ORDER BY talks DESC
        LIMIT ?
        """
        rows = query_db(sql, (year, limit))
    else:
        sql = """
        SELECT sp.name, COUNT(*) AS talks
        FROM speakers sp
        WHERE sp.name IS NOT NULL
          AND TRIM(sp.name) <> ''
        GROUP BY LOWER(TRIM(sp.name))
        ORDER BY talks DESC
        LIMIT ?
        """
        rows = query_db(sql, (limit,))

    return jsonify(rows)

# fuzzy search speakers by partial name
@app.route("/api/speakers_search")
def api_speakers_search():
    q = request.args.get("q", "").strip()
    try:
        limit = int(request.args.get("limit", 20))
    except ValueError:
        limit = 20

    if not q:
        return jsonify([])

    sql = """
    SELECT MIN(sp.name) AS name, COUNT(*) AS talks
    FROM speakers sp
    WHERE sp.name IS NOT NULL
      AND TRIM(sp.name) <> ''
      AND LOWER(sp.name) LIKE LOWER(?)
    GROUP BY LOWER(TRIM(sp.name))
    ORDER BY talks DESC
    LIMIT ?
    """
    rows = query_db(sql, (f"%{q}%", limit))
    return jsonify(rows)


# list all sessions of a given speaker (with optional filters)
@app.route("/api/speaker_sessions")
def api_speaker_sessions():
    name = request.args.get("name", "").strip()
    year = request.args.get("year", "").strip()
    track = request.args.get("track", "").strip()
    lang = request.args.get("lang", "").strip()

    if not name:
        return jsonify([])

    sql = """
    SELECT
        s.session_id,
        s.year,
        s.date,
        s.start,
        s.end,
        s.track,
        s.lang,
        s.title,
        sp.company AS company
    FROM speakers sp
    JOIN sessions s ON sp.session_uid = s.session_uid
    WHERE LOWER(TRIM(sp.name)) = LOWER(TRIM(?))
      AND (
        sp.company IS NULL
        OR TRIM(sp.company) = ''
        OR LOWER(TRIM(sp.company)) NOT LIKE 'tdwi%'
      )
    """
    params = [name]

    if year:
        sql += " AND s.year = ?"
        params.append(year)

    if track:
        sql += " AND LOWER(TRIM(s.track)) = LOWER(TRIM(?))"
        params.append(track)

    if lang:
        sql += " AND s.lang = ?"
        params.append(lang)

    sql += " ORDER BY s.year, s.date, s.start"

    rows = query_db(sql, params)
    return jsonify(rows)


# speaker's talks distribution by track
@app.route("/api/speaker_tracks")
def api_speaker_tracks():
    name = request.args.get("name", "").strip()
    year = request.args.get("year", "").strip()

    if not name:
        return jsonify([])

    if year:
        sql = """
        SELECT s.track, COUNT(*) AS talks
        FROM speakers sp
        JOIN sessions s ON sp.session_uid = s.session_uid
        WHERE LOWER(TRIM(sp.name)) = LOWER(TRIM(?))
          AND s.year = ?
          AND s.track IS NOT NULL
          AND TRIM(s.track) <> ''
        GROUP BY s.track
        ORDER BY talks DESC
        """
        rows = query_db(sql, (name, year))
    else:
        sql = """
        SELECT s.track, COUNT(*) AS talks
        FROM speakers sp
        JOIN sessions s ON sp.session_uid = s.session_uid
        WHERE LOWER(TRIM(sp.name)) = LOWER(TRIM(?))
          AND s.track IS NOT NULL
          AND TRIM(s.track) <> ''
        GROUP BY s.track
        ORDER BY talks DESC
        """
        rows = query_db(sql, (name,))
    return jsonify(rows)


# speaker's talks distribution by language
@app.route("/api/speaker_langs")
def api_speaker_langs():
    name = request.args.get("name", "").strip()
    year = request.args.get("year", "").strip()

    if not name:
        return jsonify([])

    params = [name]
    sql = """
    SELECT s.lang, COUNT(*) AS talks
    FROM speakers sp
    JOIN sessions s ON sp.session_uid = s.session_uid
    WHERE LOWER(TRIM(sp.name)) = LOWER(TRIM(?))
    """

    if year:
        sql += " AND s.year = ?"
        params.append(year)

    sql += """
    GROUP BY s.lang
    ORDER BY talks DESC
    """

    rows = query_db(sql, params)
    return jsonify(rows)


# companies a speaker has represented over time
@app.route("/api/speaker_companies_over_time")
def api_speaker_companies_over_time():
    name = request.args.get("name", "").strip()

    if not name:
        return jsonify([])

    sql = """
    SELECT
        s.year,
        sp.company,
        COUNT(*) AS talks
    FROM speakers sp
    JOIN sessions s ON sp.session_uid = s.session_uid
    WHERE LOWER(TRIM(sp.name)) = LOWER(TRIM(?))
      AND sp.company IS NOT NULL
      AND TRIM(sp.company) <> ''
      AND LOWER(TRIM(sp.company)) NOT LIKE 'tdwi%'
      AND s.year IS NOT NULL
    GROUP BY s.year, sp.company
    ORDER BY s.year, talks DESC
    """
    rows = query_db(sql, (name,))
    return jsonify(rows)


# unique speakers per year (global)
@app.route("/api/unique_speakers_per_year")
def api_unique_speakers_per_year():
    sql = """
    SELECT
        s.year,
        COUNT(DISTINCT LOWER(TRIM(sp.name))) AS speakers
    FROM speakers sp
    JOIN sessions s ON sp.session_uid = s.session_uid
    WHERE s.year IS NOT NULL
      AND sp.name IS NOT NULL
      AND TRIM(sp.name) <> ''
    GROUP BY s.year
    ORDER BY s.year
    """
    rows = query_db(sql)
    return jsonify(rows)

# speaker company switch stats (how many speakers have 2+ companies)
@app.route("/api/speaker_company_switch_stats")
def api_speaker_company_switch_stats():
    try:
        min_companies = int(request.args.get("min_companies", 2))
    except ValueError:
        min_companies = 2

    # total speakers (that have at least 1 non-empty company)
    total_sql = """
    SELECT COUNT(*) AS total
    FROM (
        SELECT LOWER(TRIM(sp.name)) AS k
        FROM speakers sp
        WHERE sp.name IS NOT NULL AND TRIM(sp.name) <> ''
          AND sp.company IS NOT NULL AND TRIM(sp.company) <> ''
          AND LOWER(TRIM(sp.company)) NOT LIKE 'tdwi%'
        GROUP BY LOWER(TRIM(sp.name))
    ) t
    """

    # speakers who represented >= min_companies distinct companies
    changed_sql = """
    SELECT COUNT(*) AS changed
    FROM (
        SELECT LOWER(TRIM(sp.name)) AS k
        FROM speakers sp
        WHERE sp.name IS NOT NULL AND TRIM(sp.name) <> ''
          AND sp.company IS NOT NULL AND TRIM(sp.company) <> ''
          AND LOWER(TRIM(sp.company)) NOT LIKE 'tdwi%'
        GROUP BY LOWER(TRIM(sp.name))
        HAVING COUNT(DISTINCT LOWER(TRIM(sp.company))) >= ?
    ) t
    """

    total_rows = query_db(total_sql)
    changed_rows = query_db(changed_sql, (min_companies,))

    total = (total_rows[0]["total"] if total_rows else 0) or 0
    changed = (changed_rows[0]["changed"] if changed_rows else 0) or 0
    single = max(total - changed, 0)

    return jsonify({
        "min_companies": min_companies,
        "total": total,
        "changed": changed,
        "single": single
    })


# list speakers who represented 2+ companies
@app.route("/api/speakers_changed_companies")
def api_speakers_changed_companies():
    try:
        min_companies = int(request.args.get("min_companies", 2))
    except ValueError:
        min_companies = 2

    try:
        limit = int(request.args.get("limit", 500))
    except ValueError:
        limit = 500

    sql = """
    SELECT
        MIN(sp.name) AS name,
        COUNT(DISTINCT LOWER(TRIM(sp.company))) AS companies_count,
        GROUP_CONCAT(DISTINCT TRIM(sp.company)) AS companies,
        GROUP_CONCAT(DISTINCT s.year) AS years
    FROM speakers sp
    JOIN sessions s ON sp.session_uid = s.session_uid
    WHERE sp.name IS NOT NULL AND TRIM(sp.name) <> ''
      AND sp.company IS NOT NULL AND TRIM(sp.company) <> ''
      AND LOWER(TRIM(sp.company)) NOT LIKE 'tdwi%'
      AND s.year IS NOT NULL
    GROUP BY LOWER(TRIM(sp.name))
    HAVING COUNT(DISTINCT LOWER(TRIM(sp.company))) >= ?
    ORDER BY companies_count DESC, name ASC
    LIMIT ?
    """
    rows = query_db(sql, (min_companies, limit))
    return jsonify(rows)

@app.route("/api/speaker_tdwi_sessions")
def api_speaker_tdwi_sessions():
    name = request.args.get("name", "").strip()
    year = request.args.get("year", "").strip()

    if not name:
        return jsonify([])

    sql = """
    SELECT
        s.session_id,
        s.year,
        s.date,
        s.start,
        s.end,
        s.track,
        s.lang,
        s.title,
        sp.company AS affiliation
    FROM speakers sp
    JOIN sessions s ON sp.session_uid = s.session_uid
    WHERE LOWER(TRIM(sp.name)) = LOWER(TRIM(?))
      AND sp.company IS NOT NULL AND TRIM(sp.company) <> ''
      AND LOWER(TRIM(sp.company)) LIKE 'tdwi%'
    """
    params = [name]

    if year:
        sql += " AND s.year = ?"
        params.append(year)

    sql += " ORDER BY s.year, s.date, s.start"

    rows = query_db(sql, params)
    return jsonify(rows)

@app.route("/api/speaker_tdwi_stats")
def api_speaker_tdwi_stats():
    name = request.args.get("name", "").strip()
    year = request.args.get("year", "").strip()

    if not name:
        return jsonify({"total": 0, "by_year": [], "by_role": []})

    base_where = """
      LOWER(TRIM(sp.name)) = LOWER(TRIM(?))
      AND sp.company IS NOT NULL AND TRIM(sp.company) <> ''
      AND LOWER(TRIM(sp.company)) LIKE 'tdwi%'
    """

    # total
    total_sql = f"""
    SELECT COUNT(*) AS total
    FROM speakers sp
    JOIN sessions s ON sp.session_uid = s.session_uid
    WHERE {base_where}
    """
    params_total = [name]
    if year:
        total_sql += " AND s.year = ?"
        params_total.append(year)

    total_rows = query_db(total_sql, params_total)
    total = (total_rows[0]["total"] if total_rows else 0) or 0

    # by year
    by_year_sql = f"""
    SELECT s.year, COUNT(*) AS talks
    FROM speakers sp
    JOIN sessions s ON sp.session_uid = s.session_uid
    WHERE {base_where}
    """
    params_by_year = [name]
    if year:
        by_year_sql += " AND s.year = ?"
        params_by_year.append(year)

    by_year_sql += """
    GROUP BY s.year
    ORDER BY s.year
    """
    by_year = query_db(by_year_sql, params_by_year)

    # by role/affiliation text
    by_role_sql = f"""
    SELECT MIN(sp.company) AS role, COUNT(*) AS talks
    FROM speakers sp
    JOIN sessions s ON sp.session_uid = s.session_uid
    WHERE {base_where}
    """
    params_by_role = [name]
    if year:
        by_role_sql += " AND s.year = ?"
        params_by_role.append(year)

    by_role_sql += """
    GROUP BY LOWER(TRIM(sp.company))
    ORDER BY talks DESC
    """
    by_role = query_db(by_role_sql, params_by_role)

    return jsonify({
        "total": total,
        "by_year": by_year,
        "by_role": by_role
    })

@app.route("/api/tdwi_experts_top")
def api_tdwi_experts_top():
    try:
        limit = int(request.args.get("limit", 3))
    except ValueError:
        limit = 3

    sql = """
    SELECT
        MIN(sp.name) AS name,
        GROUP_CONCAT(DISTINCT s.year) AS years,
        COUNT(*) AS talks
    FROM speakers sp
    JOIN sessions s ON sp.session_uid = s.session_uid
    WHERE sp.name IS NOT NULL AND TRIM(sp.name) <> ''
      AND sp.company IS NOT NULL AND TRIM(sp.company) <> ''
      AND LOWER(TRIM(sp.company)) LIKE 'tdwi%'
      AND s.year IS NOT NULL
    GROUP BY LOWER(TRIM(sp.name))
    ORDER BY talks DESC, name ASC
    LIMIT ?
    """
    rows = query_db(sql, (limit,))
    return jsonify(rows)

# -----------------------------
# Companies page
# -----------------------------
@app.route("/companies")
def company_page():
    years = query_db("""
        SELECT DISTINCT year
        FROM sessions
        WHERE year IS NOT NULL
        ORDER BY year
    """)
    years = [y["year"] for y in years]
    return render_template("companies.html", years=years)


# Company count per year 
@app.route("/api/company_count")
def api_company_count():
    company = request.args.get("company", "").strip()
    year = request.args.get("year", "").strip()

    if not company:
        return jsonify([])

    if year:
        sql = """
        SELECT s.year, COUNT(*) AS talks
        FROM speakers sp
        JOIN sessions s ON sp.session_uid = s.session_uid
        WHERE LOWER(TRIM(sp.company)) = LOWER(TRIM(?))
          AND s.year = ?
        GROUP BY s.year
        ORDER BY s.year
        """
        rows = query_db(sql, (company, year))
    else:
        sql = """
        SELECT s.year, COUNT(*) AS talks
        FROM speakers sp
        JOIN sessions s ON sp.session_uid = s.session_uid
        WHERE LOWER(TRIM(sp.company)) = LOWER(TRIM(?))
        GROUP BY s.year
        ORDER BY s.year
        """
        rows = query_db(sql, (company,))

    return jsonify(rows)


# Top companies 
@app.route("/api/top_companies")
def api_top_companies():
    year = request.args.get("year", "").strip()
    limit = int(request.args.get("limit", 20))

    if year:
        sql = """
        SELECT sp.company, COUNT(*) AS talks
        FROM speakers sp
        JOIN sessions s ON sp.session_uid = s.session_uid
        WHERE s.year = ?
          AND sp.company IS NOT NULL
          AND TRIM(sp.company) <> ''
        GROUP BY LOWER(TRIM(sp.company))
        ORDER BY talks DESC
        LIMIT ?
        """
        rows = query_db(sql, (year, limit))
    else:
        sql = """
        SELECT sp.company, COUNT(*) AS talks
        FROM speakers sp
        WHERE sp.company IS NOT NULL
          AND TRIM(sp.company) <> ''
        GROUP BY LOWER(TRIM(sp.company))
        ORDER BY talks DESC
        LIMIT ?
        """
        rows = query_db(sql, (limit,))

    return jsonify(rows)
# fuzzy search companies by partial name
@app.route("/api/companies_search")
def api_companies_search():
    q = request.args.get("q", "").strip()
    try:
        limit = int(request.args.get("limit", 20))
    except ValueError:
        limit = 20

    if not q:
        return jsonify([])

    sql = """
    SELECT MIN(sp.company) AS company, COUNT(*) AS talks
    FROM speakers sp
    WHERE sp.company IS NOT NULL
      AND TRIM(sp.company) <> ''
      AND LOWER(sp.company) LIKE LOWER(?)
    GROUP BY LOWER(TRIM(sp.company))
    ORDER BY talks DESC
    LIMIT ?
    """
    rows = query_db(sql, (f"%{q}%", limit))
    return jsonify(rows)

# list all sessions for a given company
@app.route("/api/company_sessions")
def api_company_sessions():
    company = request.args.get("company", "").strip()
    year = request.args.get("year", "").strip()
    track = request.args.get("track", "").strip()
    lang = request.args.get("lang", "").strip()

    if not company:
        return jsonify([])

    sql = """
    SELECT
        s.session_id,
        s.year,
        s.date,
        s.start,
        s.end,
        s.track,
        s.lang,
        s.title,
        sp.name AS speaker
    FROM speakers sp
    JOIN sessions s ON sp.session_uid = s.session_uid
    WHERE LOWER(TRIM(sp.company)) = LOWER(TRIM(?))
    """
    params = [company]

    if year:
        sql += " AND s.year = ?"
        params.append(year)

    if track:
        sql += " AND LOWER(TRIM(s.track)) = LOWER(TRIM(?))"
        params.append(track)

    if lang:
        sql += " AND s.lang = ?"
        params.append(lang)

    sql += " ORDER BY s.year, s.date, s.start"

    rows = query_db(sql, params)
    return jsonify(rows)


# company's talks distribution by track
@app.route("/api/company_tracks")
def api_company_tracks():
    company = request.args.get("company", "").strip()
    year = request.args.get("year", "").strip()

    if not company:
        return jsonify([])

    if year:
        sql = """
        SELECT s.track, COUNT(*) AS talks
        FROM speakers sp
        JOIN sessions s ON sp.session_uid = s.session_uid
        WHERE LOWER(TRIM(sp.company)) = LOWER(TRIM(?))
          AND s.year = ?
          AND s.track IS NOT NULL
          AND TRIM(s.track) <> ''
        GROUP BY s.track
        ORDER BY talks DESC
        """
        rows = query_db(sql, (company, year))
    else:
        sql = """
        SELECT s.track, COUNT(*) AS talks
        FROM speakers sp
        JOIN sessions s ON sp.session_uid = s.session_uid
        WHERE LOWER(TRIM(sp.company)) = LOWER(TRIM(?))
          AND s.track IS NOT NULL
          AND TRIM(s.track) <> ''
        GROUP BY s.track
        ORDER BY talks DESC
        """
        rows = query_db(sql, (company,))
    return jsonify(rows)


# company's talks distribution by language
@app.route("/api/company_langs")
def api_company_langs():
    company = request.args.get("company", "").strip()
    year = request.args.get("year", "").strip()

    if not company:
        return jsonify([])

    params = [company]
    sql = """
    SELECT s.lang, COUNT(*) AS talks
    FROM speakers sp
    JOIN sessions s ON sp.session_uid = s.session_uid
    WHERE LOWER(TRIM(sp.company)) = LOWER(TRIM(?))
    """

    if year:
        sql += " AND s.year = ?"
        params.append(year)

    sql += """
    GROUP BY s.lang
    ORDER BY talks DESC
    """

    rows = query_db(sql, params)
    return jsonify(rows)


# top speakers for a given company 
@app.route("/api/company_speakers")
def api_company_speakers():
    company = request.args.get("company", "").strip()
    year = request.args.get("year", "").strip()
    try:
        limit = int(request.args.get("limit", 20))
    except ValueError:
        limit = 20

    if not company:
        return jsonify([])

    params = [company]
    sql = """
    SELECT MIN(sp.name) AS name, COUNT(*) AS talks
    FROM speakers sp
    JOIN sessions s ON sp.session_uid = s.session_uid
    WHERE LOWER(TRIM(sp.company)) = LOWER(TRIM(?))
    """

    if year:
        sql += " AND s.year = ?"
        params.append(year)

    sql += """
    AND sp.name IS NOT NULL
    AND TRIM(sp.name) <> ''
    GROUP BY LOWER(TRIM(sp.name))
    ORDER BY talks DESC
    LIMIT ?
    """
    params.append(limit)

    rows = query_db(sql, params)
    return jsonify(rows)


# unique companies per year 
@app.route("/api/unique_companies_per_year")
def api_unique_companies_per_year():
    sql = """
    SELECT
        s.year,
        COUNT(DISTINCT LOWER(TRIM(sp.company))) AS companies
    FROM speakers sp
    JOIN sessions s ON sp.session_uid = s.session_uid
    WHERE s.year IS NOT NULL
      AND sp.company IS NOT NULL
      AND TRIM(sp.company) <> ''
    GROUP BY s.year
    ORDER BY s.year
    """
    rows = query_db(sql)
    return jsonify(rows)


# -----------------------------------
# Suggest APIs for autocomplete
# -----------------------------------

@app.route("/api/speaker_suggest")
def api_speaker_suggest():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])

    sql = """
        SELECT DISTINCT name
        FROM speakers
        WHERE name IS NOT NULL
          AND TRIM(name) != ''
          AND LOWER(name) LIKE LOWER(?)
        ORDER BY name
        LIMIT 15
    """
    rows = query_db(sql, (q + "%",))
    return jsonify([{"name": r["name"]} for r in rows])


@app.route("/api/company_suggest")
def api_company_suggest():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])

    sql = """
        SELECT DISTINCT company
        FROM speakers sp
        WHERE company IS NOT NULL
          AND TRIM(company) != ''
          AND LOWER(company) LIKE LOWER(?)
        ORDER BY company
        LIMIT 15
    """
    rows = query_db(sql, (q + "%",))
    return jsonify([{"company": r["company"]} for r in rows])


# -----------------------------
# Sessions page
# -----------------------------
@app.route("/sessions")
def sessions_analytics_page():
    return render_template("sessions.html") 

# Text pipeline 
WORD_RE = re.compile(r"[a-zA-ZäöüÄÖÜß]+")

# Multi-word phrases (always allowed; treated as tech by definition)
PHRASES = {
    # AI/ML
    "artificial intelligence": ["artificial intelligence"],
    "machine learning": ["machine learning", "machinelearning", "ml"],
    "deep learning": ["deep learning"],
    "generative ai": ["generative ai", "genai"],
    "large language model": ["large language model", "llm"],
    "natural language processing": ["natural language processing", "nlp"],

    # Data/Arch
    "data mesh": ["data mesh"],
    "data lakehouse": ["data lakehouse", "lakehouse"],
    "data warehouse": ["data warehouse", "dwh"],
    "data governance": ["data governance"],
    "cloud computing": ["cloud computing"],
    "cloud native": ["cloud native"],
    "business intelligence": ["business intelligence", "bi"],
    "master data management": ["master data management", "mdm"],
    "data engineering": ["data engineering"],
    "data quality": ["data quality"],

    # Ops
    "mlops": ["mlops"],
    "devops": ["devops"],
    "data ops": ["data ops", "dataops"],
    "site reliability engineering": ["site reliability engineering", "sre"],

    # Security / Privacy
    "data protection": ["data protection"],
    "privacy by design": ["privacy by design"],
    "zero trust": ["zero trust"],

    # Modern patterns
    "retrieval augmented generation": ["retrieval augmented generation", "rag"],
    "vector database": ["vector database", "vectordatabase"],
}

# semantic normalization
SEMANTIC_MAP = {
    # multilingual
    "daten": "data",
    "données": "data",

    "analysis": "analytics",
    "analyse": "analytics",
    "analytik": "analytics",

    "clouds": "cloud",
    "wolke": "cloud",

    # abbreviations
    "ai": "ai",
    "ki": "ai",
    "ml": "machine learning",
    "llm": "large language model",
    "genai": "generative ai",
    "bi": "business intelligence",
    "nlp": "natural language processing",
    "mdm": "master data management",
    "dwh": "data warehouse",
    "etl": "etl",
    "elt": "elt",
    "api": "api",
    "sql": "sql",
    "nosql": "nosql",
    "rag": "retrieval augmented generation",
    "sre": "site reliability engineering",
}

# allow short tech tokens
ALLOW_SHORT = {"ai", "ml", "bi", "nlp", "llm", "mdm", "etl", "elt", "api", "sql", "dwh", "rag", "sre"}

# general stopwords + German filler/discourse + project noise
STOPWORDS = {
    # EN core
    "the","and","or","with","from","into","this","that","these","those",
    "using","used","use","is","are","was","were","be","been","can","will",
    "also","via","per","within","between","among","across","over","under",
    "about","onto","than","then","there","their","them","they","we","you",
    "your","our","ours","its","it","as","at","by","in","on","to","of","for","an","a",

    # DE articles / connectors
    "der","die","das","den","dem","des",
    "ein","eine","einer","einem","einen","eines",
    "und","oder","aber","auch","nicht",
    "mit","von","für","ohne","über","unter","nach","vor","bei","aus","am","im","um","an",
    "durch","beim","ins","aufs","zur","zum",
    "sein","bin","bist","ist","sind","seid","war","waren","gewesen",
    "werden","wird","wurden","würde","würden",
    "haben","hat","hatte","hatten",
    "können","kann","konnte","könnte",
    "müssen","muss","musste",
    "sollen","soll","sollte",
    "sich","dies","diese","dieser","diesem",
    "welche","welcher","welches","welchem",
    "dabei","innen",

    # DE discourse / filler
    "dass","damit","daher","dazu","denn","doch","eben","eher","einfach","endlich",
    "etwa","ganz","gerade","halt","hier","heute","immer","insbesondere","jedoch",
    "kaum","mehr","noch","nur","oft","sehr","sogar","so","sowie","umso",
    "viel","viele","vielen","wichtig","wichtige","wichtigen","wichtigste",
    "zeigen","zeigt","zeigte","stellt","stellen","machen","macht","sagen","sagt",

    # DE pronouns/possessives
    "ich","du","er","sie","es","wir","ihr","ihnen","mich","dich",
    "mein","meine","meiner","meinem","meinen",
    "dein","deine","deiner","deinem","deinen",
    "sein","seine","seiner","seinem","seinen",
    "ihr","ihre","ihrer","ihrem","ihren",
    "unser","unsere","unserer","unserem","unseren",

    # conference / boilerplate
    "session","sessions","track","tracks","abstract","intro","basic","extended",
    "vortrag","voraussetzungen","zielpublikum","schwierigkeitsgrad",
    "nbsp","amp","etc","co","gmbh","ag","kg","inc","ltd",

    # generic non-tech nouns you often see
    "lösung","lösungen","ansatz","ansätze","beispiel","beispiele","ergebnis","ergebnisse",
    "projekt","projekte","thema","themen","teilnehmer","teilnehmenden","praxis","praxisnah",
    "unternehmen","business","case","science","einsteiger","herausforderungen",
}

# TECH vocabulary gate (single tokens)
TECH_VOCAB = {
    # data & analytics
    "data","analytics","dashboard","reporting","visualization","bi","metric","kpi",
    "warehouse","lakehouse","mesh","governance","catalog","metadata","lineage",
    "quality","master","mdm","model","schema","semantic","ontology",
    "etl","elt","pipeline","orchestration","airflow","dbt","spark","kafka","streaming",
    "batch","realtime","real","time",

    # cloud & platform
    "cloud","aws","azure","gcp","kubernetes","docker","container","serverless",
    "microservices","architecture","scalability","availability","resilience",
    "latency","throughput","performance","observability","monitoring","logging","tracing",

    # security & privacy
    "privacy","security","encryption","pseudonymization","anonymization",
    "compliance","gdpr","access","iam","authorization","authentication","zero","trust",

    # AI/ML
    "ai","machine","learning","deep","generative","llm","nlp",
    "embedding","vector","retrieval","rag","inference","training","finetuning",
    "transformer","prompt","evaluation","drift",

    # databases / query
    "sql","nosql","graph","vector","database","query","index","indexes",
}

# suffix heuristics for tech-like words
TECH_SUFFIX = (
    "tion","tions","ing","ment","ware","ops","ability","ization","isation",
    "graph","graphs","metric","metrics","schema","schemas","pipeline","pipelines",
    "cluster","clustering","embedding","embeddings","vector","vectors",
)
DE_TECH_SUFFIX = (
    "ung","keit","heit","isierung","daten","analyse","modell","modelle","architektur"
)

def _is_tech_token(token: str) -> bool:
    t = token.lower().strip()
    if not t:
        return False
    if t in TECH_VOCAB:
        return True
    if t.endswith(TECH_SUFFIX) or t.endswith(DE_TECH_SUFFIX):
        return True
    return False


def extract_terms(text: str, mode: str = "tech") -> Counter:
    """
    mode:
      - "tech": tech-only (default)
      - "open": broader (still uses stopwords + mapping)
    """
    text = (text or "").lower()
    c = Counter()

    # 1) phrases first
    for canon, variants in PHRASES.items():
        for v in variants:
            v = v.lower()
            if v in text:
                n = text.count(v)
                if n:
                    c[canon] += n
                    text = text.replace(v, " ")

    # 2) tokens
    words = WORD_RE.findall(text)
    for w in words:
        w = w.lower()
        if w in STOPWORDS:
            continue

        mapped = SEMANTIC_MAP.get(w, w)

        # drop short tokens unless allowed OR mapped to longer tech concept
        if len(w) <= 3 and w not in ALLOW_SHORT and mapped == w:
            continue

        if mapped in STOPWORDS:
            continue

        if mode == "tech":
            if not _is_tech_token(mapped):
                continue

        c[mapped] += 1

    return c


# DataFrames
def get_sessions_df():
    rows = query_db("""
        SELECT session_uid, year, date, start, end, lang, track, title, abstract
        FROM sessions
        WHERE year IS NOT NULL
    """)
    df = pd.DataFrame(rows)
    if df.empty:
        return df

    df["year"] = df["year"].astype(int)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")

    def parse_time_to_minutes(x):
        if not isinstance(x, str) or ":" not in x:
            return np.nan
        try:
            h, m = x.split(":")
            return int(h) * 60 + int(m)
        except:
            return np.nan

    df["start_min"] = df["start"].apply(parse_time_to_minutes)
    df["end_min"] = df["end"].apply(parse_time_to_minutes)
    df["duration_min"] = df["end_min"] - df["start_min"]
    df.loc[(df["duration_min"] <= 0) | (df["duration_min"] > 24 * 60), "duration_min"] = np.nan

    df["title"] = df["title"].fillna("")
    df["abstract"] = df["abstract"].fillna("")
    df["text_all"] = (df["title"] + " " + df["abstract"]).str.strip()

    # Keep for KPI + abstract length chart
    df["has_abstract"] = df["abstract"].str.strip().ne("")
    df["abstract_len"] = df["abstract"].str.len()

    df["track_clean"] = df["track"].fillna("").str.replace("#", "", regex=False).str.strip()

    return df

# Sessions Analytics APIs
@app.route("/api/sessions/years")
def api_sessions_years():
    df = get_sessions_df()
    years = sorted(df["year"].unique().tolist()) if not df.empty else []
    return jsonify({"years": years})


@app.route("/api/sessions/overview")
def api_sessions_overview():
    df = get_sessions_df()
    if df.empty:
        return jsonify({"summary": {}, "sessions_per_year": []})

    sessions_per_year = df.groupby("year").size().reset_index(name="n").to_dict("records")

    total = int(df.shape[0])
    years = sorted(df["year"].unique().tolist())
    peak_year = int(df.groupby("year").size().idxmax())
    tracks_total = int(df["track_clean"].replace("", np.nan).nunique(dropna=True))
    avg_duration = float(df["duration_min"].dropna().mean()) if df["duration_min"].notna().any() else None
    pct_has_abstract = float(df["has_abstract"].mean() * 100.0)

    yearly_counts = df.groupby("year").size().reindex(years).astype(float)
    yoy = yearly_counts.pct_change() * 100.0
    yoy_dict = {str(y): (None if pd.isna(v) else float(round(v, 2))) for y, v in yoy.items()}

    summary = {
        "total_sessions": total,
        "years_covered": [int(years[0]), int(years[-1])] if years else [],
        "peak_year": peak_year,
        "unique_tracks_total": tracks_total,
        "avg_duration_min": None if avg_duration is None else float(round(avg_duration, 1)),
        "pct_with_abstract": float(round(pct_has_abstract, 1)),
        "yoy_growth_pct": yoy_dict,
    }

    return jsonify({
        "summary": summary,
        "sessions_per_year": sessions_per_year,
    })


@app.route("/api/sessions/track_trends")
def api_sessions_track_trends():
    top_k = int(request.args.get("top_k", 10))
    df = get_sessions_df()
    if df.empty:
        return jsonify({"years": [], "top_tracks": [], "pivot": {}, "unique_tracks_per_year": {}})

    df2 = df[df["track_clean"].str.strip().ne("")].copy()
    years = sorted(df["year"].unique().tolist())

    uniq = df2.groupby("year")["track_clean"].nunique().reindex(years).fillna(0).astype(int).to_dict()
    unique_tracks_per_year = {str(y): int(uniq[y]) for y in uniq}

    top_tracks = df2["track_clean"].value_counts().head(top_k).index.tolist()

    pivot = {}
    for t in top_tracks:
        s = df2[df2["track_clean"] == t].groupby("year").size().reindex(years).fillna(0).astype(int)
        pivot[t] = {str(y): int(s.loc[y]) for y in years}

    return jsonify({
        "years": years,
        "top_tracks": top_tracks,
        "pivot": pivot,
        "unique_tracks_per_year": unique_tracks_per_year
    })


@app.route("/api/sessions/lang_trends")
def api_sessions_lang_trends():
    df = get_sessions_df()
    if df.empty:
        return jsonify({"years": [], "labels": [], "pivot": {}})

    years = sorted(df["year"].unique().tolist())
    labels = sorted(df["lang"].fillna(-1).astype(int).unique().tolist())

    pivot = {}
    for lab in labels:
        s = df[df["lang"].fillna(-1).astype(int) == lab].groupby("year").size().reindex(years).fillna(0).astype(int)
        pivot[str(lab)] = {str(y): int(s.loc[y]) for y in years}

    return jsonify({"years": years, "labels": labels, "pivot": pivot})


# removed Abstract coverage (%) output (backend)
@app.route("/api/sessions/text_stats")
def api_sessions_text_stats():
    """
    Only abstract length stats (mean/median/p75) per year.
    (Abstract coverage removed as requested.)
    """
    df = get_sessions_df()
    if df.empty:
        return jsonify({"years": [], "abstract_len": {}})

    years = sorted(df["year"].unique().tolist())

    def stats(series):
        series = series.dropna()
        if series.empty:
            return {"mean": None, "median": None, "p75": None}
        return {
            "mean": float(round(series.mean(), 1)),
            "median": float(round(series.median(), 1)),
            "p75": float(round(series.quantile(0.75), 1)),
        }

    abstract_len = {}
    for y in years:
        sub = df[df["year"] == y]
        abstract_len[str(y)] = stats(sub.loc[sub["has_abstract"], "abstract_len"])

    return jsonify({
        "years": years,
        "abstract_len": abstract_len,
    })


@app.route("/api/sessions/wordcloud")
def api_sessions_wordcloud():
    """
    Params:
      year=2024 or "all"
      field=title|abstract|all
      mode=tech|open   (default: tech)
      top_n=80
    """
    year = request.args.get("year", "all")
    field = request.args.get("field", "all")
    mode = request.args.get("mode", "tech")
    top_n = int(request.args.get("top_n", 80))

    df = get_sessions_df()
    if df.empty:
        return jsonify({"year": year, "field": field, "mode": mode, "keywords": []})

    if year != "all":
        try:
            y = int(year)
            df = df[df["year"] == y]
        except:
            pass

    if field == "title":
        texts = df["title"].tolist()
    elif field == "abstract":
        texts = df["abstract"].tolist()
    else:
        texts = df["text_all"].tolist()

    agg = Counter()
    for t in texts:
        agg.update(extract_terms(t, mode=mode))

    keywords = [{"word": w, "count": int(c)} for w, c in agg.most_common(top_n)]
    return jsonify({"year": year, "field": field, "mode": mode, "keywords": keywords})


@app.route("/api/sessions/trending_terms")
def api_sessions_trending_terms():
    """
    TF-IDF on YEAR-level documents (year-as-document).
    Params:
      year=2024
      top_n=15
      mode=tech|open (default: tech)
    """
    year = request.args.get("year")
    top_n = int(request.args.get("top_n", 15))
    mode = request.args.get("mode", "tech")

    df = get_sessions_df()
    if df.empty:
        return jsonify({"year": year, "mode": mode, "top_terms": []})

    years = sorted(df["year"].unique().tolist())
    year_docs = []
    for y in years:
        text = " ".join(df[df["year"] == y]["text_all"].tolist())
        year_docs.append(text)

    def analyzer(doc):
        c = extract_terms(doc, mode=mode)
        out = []
        for w, n in c.items():
            out.extend([w] * min(n, 10))
        return out

    vect = TfidfVectorizer(
        analyzer=analyzer,
        lowercase=False,
        min_df=1
    )
    X = vect.fit_transform(year_docs)
    terms = np.array(vect.get_feature_names_out())

    try:
        y_sel = int(year)
    except:
        y_sel = years[-1] if years else None

    if y_sel not in years:
        y_sel = years[-1] if years else None

    idx = years.index(y_sel)
    row = X[idx].toarray().ravel()
    top_idx = row.argsort()[::-1][:top_n]

    top_terms = [{"word": str(terms[i]), "score": float(round(row[i], 4))} for i in top_idx if row[i] > 0]
    return jsonify({"year": int(y_sel) if y_sel is not None else None, "mode": mode, "top_terms": top_terms})


@app.route("/api/sessions/term_trend")
def api_sessions_term_trend():
    """
    Term frequency per year.
    Params:
      term=machine learning
      mode=tech|open (default: tech)
    """
    term = (request.args.get("term") or "").strip().lower()
    mode = request.args.get("mode", "tech")

    df = get_sessions_df()
    if df.empty or not term:
        return jsonify({"term": term, "mode": mode, "years": [], "trend": {}})

    years = sorted(df["year"].unique().tolist())
    trend = {}
    for y in years:
        agg = Counter()
        for t in df[df["year"] == y]["text_all"].tolist():
            agg.update(extract_terms(t, mode=mode))
        trend[str(y)] = int(agg.get(term, 0))

    return jsonify({"term": term, "mode": mode, "years": years, "trend": trend})


# Cluster cache
_CLUSTER_CACHE = {"ready": False, "k": None, "mode": None, "payload": None}

def build_cluster_payload(k=6, mode="tech", max_features=4000):
    df = get_sessions_df()
    if df.empty:
        return {"k": k, "mode": mode, "clusters": [], "years": [], "pivot": {}}

    docs = df["text_all"].tolist()
    years = df["year"].tolist()

    def analyzer(doc):
        c = extract_terms(doc, mode=mode)
        out = []
        for w, n in c.items():
            out.extend([w] * min(n, 5))
        return out

    vect = TfidfVectorizer(
        analyzer=analyzer,
        lowercase=False,
        max_features=max_features,
        min_df=2
    )
    X = vect.fit_transform(docs)
    terms = np.array(vect.get_feature_names_out())

    if X.shape[0] < k:
        k = max(2, min(4, X.shape[0]))

    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = km.fit_predict(X)

    centers = km.cluster_centers_
    clusters = []
    for i in range(k):
        center = centers[i]
        top_idx = center.argsort()[::-1][:10]
        top_terms = [str(terms[j]) for j in top_idx]
        clusters.append({"cluster": i, "top_terms": top_terms})

    years_sorted = sorted(sorted(set(years)))
    pivot = {}
    for i in range(k):
        pivot[str(i)] = {str(y): 0 for y in years_sorted}
    for lab, y in zip(labels, years):
        pivot[str(lab)][str(y)] += 1

    return {"k": k, "mode": mode, "clusters": clusters, "years": years_sorted, "pivot": pivot}


@app.route("/api/sessions/clusters")
def api_sessions_clusters():
    """
    KMeans clusters.
    Params:
      k=6
      mode=tech|open (default: tech)
    """
    k = int(request.args.get("k", 6))
    mode = request.args.get("mode", "tech")

    global _CLUSTER_CACHE
    if _CLUSTER_CACHE["ready"] and _CLUSTER_CACHE["k"] == k and _CLUSTER_CACHE["mode"] == mode:
        return jsonify(_CLUSTER_CACHE["payload"])

    payload = build_cluster_payload(k=k, mode=mode)
    _CLUSTER_CACHE = {"ready": True, "k": k, "mode": mode, "payload": payload}
    return jsonify(payload)


if __name__ == "__main__":
    app.run(debug=True)
