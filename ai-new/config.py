import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("AIzaSyBIw3LpsA-NjEE4XGUNjuSLqALtBvStCFs")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")