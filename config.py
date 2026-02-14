import os

class Config:
    SECRET_KEY = os.environ.get('SESSION_SECRET', 'dev-key-placeholder')
    SQLALCHEMY_DATABASE_URI = 'sqlite:///tasks.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    GOOGLE_API_KEY = os.environ.get('GOOGLE_API_KEY', '<API_KEY>')
