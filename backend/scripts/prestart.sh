#! /usr/bin/env bash

set -e
set -x

# Let the DB start
python app/backend_pre_start.py

# Initialize database schema
echo "Initializing database schema..."
python -c "
from sqlmodel import Session, text
from app.core.db import engine
import sys

print('Checking if tables exist...')
with Session(engine) as session:
    # Check if user table exists (base table)
    try:
        result = session.exec(text('SELECT COUNT(*) FROM information_schema.tables WHERE table_name = \'user\'')).first()
        if result and result > 0:
            print('Tables already exist, skipping creation')
            sys.exit(0)
    except Exception:
        pass
    
    print('Creating tables from scratch...')
    
    # Import models after engine check to avoid circular import issues
    from app import models
    from sqlmodel import SQLModel
    
    try:
        # Create all tables
        SQLModel.metadata.create_all(engine)
        print('All tables created successfully')
        
        # Verify role_prompt table 
        result = session.exec(text(\"\"\"
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'role_prompt' AND column_name = 'version'
        \"\"\")).first()
        
        if result:
            print(f'role_prompt.version: {result[0]} ({result[1]})')
        else:
            print('WARNING: role_prompt.version not found')
            
    except Exception as e:
        print(f'Error creating tables: {e}')
        sys.exit(1)
"

echo "Database schema initialization completed"

# Create initial data in DB
python app/initial_data.py
