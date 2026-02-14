from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import sqlite3
from langchain_core.output_parsers import JsonOutputParser
from langchain_google_genai import ChatGoogleGenerativeAI
from flask_cors import CORS
from typing import Optional, List
from pydantic import BaseModel, Field
import ast
import json
import re
import os
import logging
from datetime import datetime
import uuid

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "development-secret-key")
CORS(app)

# Google Gemini API setup
api_key = os.getenv("GOOGLE_API_KEY", "<API_KEY>")
llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", google_api_key=api_key)

# Database setup
DATABASE = 'tasks.db'

def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    try:
        conn = sqlite3.connect(DATABASE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Create users table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        ''')

        # Create tasks table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                task_title TEXT NOT NULL,
                description TEXT,
                priority TEXT DEFAULT 'Medium',
                time_required TEXT,
                schedule_date TEXT,
                schedule_from TEXT,
                schedule_to TEXT,
                tag TEXT DEFAULT 'OTHER',
                review TEXT,
                completed INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')

        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error initializing database: {e}")

# Initialize database
init_db()

# Helper function to validate task data
def validate_task(task_data):
    warnings = []

    def is_present_for_bucket(value):
        # Used for bucket logic (F is treated as missing)
        return str(value).strip() and str(value).strip() != "F"

    def should_validate(value):
        # Used for format checking — skip if F or empty
        return str(value).strip() not in ["", "F"]

    def is_valid_date(date_str):
        try:
            datetime.strptime(date_str.strip(), "%d/%m/%Y")
            return True
        except Exception:
            return False

    def is_valid_time(time_str):
        return bool(re.fullmatch(r'([0-9]|0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]', time_str.strip()))

    def is_valid_decimal(decimal_str):
        try:
            float(decimal_str.strip())
            return True
        except Exception:
            return False

    # Fetch values
    schedule_date = task_data.get('schedule_date', "").strip()
    schedule_from = task_data.get('schedule_from', "").strip()
    schedule_to = task_data.get('schedule_to', "").strip()
    time_required = str(task_data.get('time_required', "")).strip()

    # Format validations (only if value is not "F" or empty)
    if should_validate(schedule_date) and not is_valid_date(schedule_date):
        warnings.append("schedule_date is not in DD/MM/YYYY format.")

    if should_validate(schedule_from) and not is_valid_time(schedule_from):
        warnings.append("schedule_from is not in valid HH:MM (24-hour) format.")

    if should_validate(schedule_to) and not is_valid_time(schedule_to):
        warnings.append("schedule_to is not in valid HH:MM (24-hour) format.")

    # Check time order (only if both present and valid)
    if all(should_validate(t) and is_valid_time(t) for t in [schedule_from, schedule_to]):
        t_from = datetime.strptime(schedule_from, "%H:%M")
        t_to = datetime.strptime(schedule_to, "%H:%M")
        if t_to <= t_from:
            warnings.append("schedule_to must be later than schedule_from.")

    if should_validate(time_required) and not is_valid_decimal(time_required):
        warnings.append("time_required must be in decimal format without any text.")

    # Bucket logic
    has_schedule_fields = all(is_present_for_bucket(field) for field in [schedule_date, schedule_from, schedule_to])
    if not has_schedule_fields:
        task_data['schedule_date'] = "F"
        task_data['schedule_from'] = "F"
        task_data['schedule_to'] = "F"
    has_time_required = is_present_for_bucket(time_required)

    if not (has_schedule_fields or has_time_required):
        warnings.append(
            "WARNING! You either need time required for the task or scheduled date and schedule time. These values are currently missing in your note."
        )

    return 1 if not warnings else 0, warnings

def extract_json_from_llm_response(response):
    pattern = "```json\n(.*?)```"
    json_str = re.findall(pattern, response.content, re.DOTALL)
    if not json_str:
        logger.debug("No JSON generated in LLM response")
        return {}
    try:
        return json.loads(json_str[0])
    except json.JSONDecodeError as e:
        logger.error(f"Error decoding JSON: {e}")
        return {}

def extract_task_details(text_input):
    """Calls Google Gemini API to extract structured task details from text."""
    now = datetime.now()
    formatted_now = now.strftime("%A, %d %B %Y, %H:%M")

    prompt = f"""
        Parse the following text and classify it into attributes:
        - task_title (generate one from the info if not explicitly provided)
        - description (generate one from the info if not explicitly provided)
        - time_required (in decimal)
        - schedule_date (DD/MM/YYYY), today is {formatted_now}
        - schedule_from (HH:MM 24hr format)
        - schedule_to (HH:MM 24hr format)
        - tag (one per task, uppercase, default 'OTHER')
        - priority (default 'Medium', can only hold High, Medium and Low values)

        Text: {text_input}
        And create a JSON type output with these attributes as keys. If you are not able to extract an attribute, fill "F" as the value
    """

    response = llm.invoke(prompt)
    return extract_json_from_llm_response(response)

# Routes
@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.json
        email = data.get('email')
        password = data.get('password')

        conn = get_db_connection()
        user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
        conn.close()

        if user and user['password'] == password:
            session['user_id'] = user['id']
            session['email'] = user['email']
            return jsonify({"success": True})
        else:
            return jsonify({"success": False, "message": "Invalid credentials"})

    return render_template('login.html')

@app.route('/signup', methods=['POST'])
def signup():
    data = request.json
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({"success": False, "message": "Email and password are required"})

    conn = get_db_connection()
    try:
        conn.execute('INSERT INTO users (email, password) VALUES (?, ?)', (email, password))
        conn.commit()
        user_id = conn.execute('SELECT id FROM users WHERE email = ?', (email,)).fetchone()['id']
        conn.close()

        session['user_id'] = user_id
        session['email'] = email
        return jsonify({"success": True})
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"success": False, "message": "Email already exists"})

@app.route('/logout')
def logout():
    session.pop('user_id', None)
    session.pop('email', None)
    return redirect(url_for('login'))

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    conn = get_db_connection()
    tasks = conn.execute('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC', 
                         (session['user_id'],)).fetchall()
    conn.close()

    return jsonify({
        "success": True,
        "tasks": [dict(task) for task in tasks]
    })

@app.route('/api/validate-task', methods=['POST'])
def validate_task_endpoint():
    task_data = request.json.get('task', {})
    valid, warnings = validate_task(task_data)
    return jsonify({
        'success': valid == 1,
        'warnings': warnings
    })



    return jsonify({
        "success": True,
        "tasks": [dict(task) for task in tasks]
    })

@app.route('/api/tasks', methods=['POST'])
def create_task():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    data = request.json
    task_data = data.get('task')

    if not task_data:
        return jsonify({"success": False, "message": "Task data is required"})

    # Handle missing task data fields
    if not task_data.get('task_title'):
        return jsonify({
            "success": False,
            "message": "Task title is required"
        })

    is_valid, warnings = validate_task(task_data)
    if warnings and len(warnings) > 0:
        # Return success with warnings, don't block task creation
        return jsonify({
            "success": True,
            "warnings": warnings,
            "message": "Task created with warnings"
        })

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute('''
            INSERT INTO tasks (
                user_id, task_title, description, priority, time_required, 
                schedule_date, schedule_from, schedule_to, tag
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            session['user_id'],
            task_data['task_title'],
            task_data['description'],
            task_data.get('priority', 'Medium'),
            task_data.get('time_required', ''),
            task_data.get('schedule_date', ''),
            task_data.get('schedule_from', ''),
            task_data.get('schedule_to', ''),
            task_data.get('tag', 'OTHER')
        ))

        conn.commit()
        task_id = cursor.lastrowid
        task = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()
        conn.close()

        return jsonify({
            "success": True,
            "task": dict(task)
        })

    except Exception as e:
        conn.close()
        return jsonify({
            "success": False,
            "message": f"Error creating task: {str(e)}"
        })

@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    data = request.json
    task_data = data.get('task')

    if not task_data:
        return jsonify({"success": False, "message": "Task data is required"})

    is_valid, warnings = validate_task(task_data)
    if not is_valid:
        return jsonify({
            "success": False,
            "warnings": warnings
        })

    conn = get_db_connection()

    # Verify task belongs to user
    task = conn.execute('SELECT * FROM tasks WHERE id = ? AND user_id = ?', 
                        (task_id, session['user_id'])).fetchone()

    if not task:
        conn.close()
        return jsonify({"success": False, "message": "Task not found or not authorized"}), 404

    try:
        conn.execute('''
            UPDATE tasks SET
                task_title = ?,
                description = ?,
                priority = ?,
                time_required = ?,
                schedule_date = ?,
                schedule_from = ?,
                schedule_to = ?,
                tag = ?
            WHERE id = ? AND user_id = ?
        ''', (
            task_data['task_title'],
            task_data['description'],
            task_data.get('priority', 'Medium'),
            task_data.get('time_required', ''),
            task_data.get('schedule_date', ''),
            task_data.get('schedule_from', ''),
            task_data.get('schedule_to', ''),
            task_data.get('tag', 'OTHER'),
            task_id,
            session['user_id']
        ))

        conn.commit()
        updated_task = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()
        conn.close()

        return jsonify({
            "success": True,
            "task": dict(updated_task)
        })

    except Exception as e:
        conn.close()
        return jsonify({
            "success": False,
            "message": f"Error updating task: {str(e)}"
        })

@app.route('/api/tasks/<int:task_id>/review', methods=['POST'])
def add_review(task_id):
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    data = request.json
    review = data.get('review')

    if not review:
        return jsonify({"success": False, "message": "Review text is required"})

    conn = get_db_connection()

    # Verify task belongs to user
    task = conn.execute('SELECT * FROM tasks WHERE id = ? AND user_id = ?', 
                        (task_id, session['user_id'])).fetchone()

    if not task:
        conn.close()
        return jsonify({"success": False, "message": "Task not found or not authorized"}), 404

    try:
        conn.execute('UPDATE tasks SET review = ? WHERE id = ?', (review, task_id))
        conn.commit()
        conn.close()

        return jsonify({
            "success": True,
            "message": "Review added successfully"
        })

    except Exception as e:
        conn.close()
        return jsonify({
            "success": False,
            "message": f"Error adding review: {str(e)}"
        })

@app.route('/api/tasks/<int:task_id>', methods=['GET'])
def get_task(task_id):
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    conn = get_db_connection()
    task = conn.execute('SELECT * FROM tasks WHERE id = ? AND user_id = ?', 
                       (task_id, session['user_id'])).fetchone()
    conn.close()

    if not task:
        return jsonify({"success": False, "message": "Task not found"}), 404

    return jsonify({
        "success": True,
        "task": dict(task)
    })

@app.route('/api/tasks/<int:task_id>/complete', methods=['POST'])
def complete_task(task_id):
    try:
        if 'user_id' not in session:
            return jsonify({"success": False, "message": "Unauthorized"}), 401

        conn = get_db_connection()
        cursor = conn.cursor()

        # Verify task belongs to user
        task = cursor.execute('SELECT * FROM tasks WHERE id = ? AND user_id = ?', 
                            (task_id, session['user_id'])).fetchone()

        if not task:
            conn.close()
            return jsonify({"success": False, "message": "Task not found or not authorized"}), 404

        # Toggle completion status
        new_status = 0 if task['completed'] == 1 else 1
        cursor.execute('UPDATE tasks SET completed = ? WHERE id = ?', (new_status, task_id))
        conn.commit()

        updated_task = cursor.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()
        conn.close()

        return jsonify({
            "success": True,
            "message": "Task status updated",
            "task": dict(updated_task) if updated_task else None
        })

    except Exception as e:
        logger.error(f"Error updating task {task_id}: {str(e)}")
        if 'conn' in locals():
            conn.close()
        return jsonify({
            "success": False,
            "message": f"Error updating task: {str(e)}"
        }), 500

@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    conn = get_db_connection()

    # Verify task belongs to user
    task = conn.execute('SELECT * FROM tasks WHERE id = ? AND user_id = ?', 
                        (task_id, session['user_id'])).fetchone()

    if not task:
        conn.close()
        return jsonify({"success": False, "message": "Task not found or not authorized"}), 404

    try:
        conn.execute('DELETE FROM tasks WHERE id = ?', (task_id,))
        conn.commit()
        conn.close()

        return jsonify({
            "success": True,
            "message": "Task deleted successfully"
        })

    except Exception as e:
        conn.close()
        return jsonify({
            "success": False,
            "message": f"Error deleting task: {str(e)}"
        })

@app.route('/api/process-voice', methods=['POST'])
def process_voice_input():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    data = request.json
    text_input = data.get('text', '')

    if not text_input:
        return jsonify({"success": False, "message": "Text input is required"})

    # Step 1: Classify intent
    classification_prompt = f"""
    Classify the following user input into one of three categories:
    - CREATE_TASK
    - UPDATE_TASK
    - ADD_REVIEW

    Some example action verbs for each category:
    - CREATE_TASK: create,add (new),schedule,plan,set up,arrange,assign,make a task,put on calendar,log (new task),add to list,note down,draft,prepare (task).

    - UPDATE_TASK: update,modify,change,edit,reschedule,shift,move,postpone,advance (earlier),delay,rename,adjust,revise,reprioritize.

    - ADD_REVIEW: add review, summarize,attach summary,add notes, attach a note, note what happened, log outcome,add feedback,leave comments, record what was done,write review,provide recap, summarize result, jot down reflection, add summary to task.

    Only output one of the three labels above.

    Input: {text_input}
    """
    classification_response = llm.invoke(classification_prompt)
    intent = classification_response.content.strip().upper()

    # Step 2: Extract task details
    task_data = extract_task_details(text_input)
    is_valid, warnings = validate_task(task_data)

    return jsonify({
        "success": True,
        "intent": intent,
        "task_data": task_data,
        "is_valid": is_valid,
        "warnings": warnings
    })

@app.route('/api/search-task', methods=['POST'])
def search_task():
    # 1. Identify User
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    # 2. Extract Prompt
    data = request.json
    query = data.get('query', '').strip()
    if not query:
        return jsonify({"success": False, "message": "Search query is required"})

    # 3. Classify Intent (already handled by LLM assistant)

    # 4. Apply LLM to Extract Task Title
    title_prompt = """Extract the exact task title from this update request. Output only the title."""
    title_response = llm.invoke(f"{title_prompt}\nText: {query}")
    task_title = title_response.content.strip()

    # 5. Return task title for editable textbox
    if data.get('extract_title_only'):
        return jsonify({
            "success": True,
            "task_title": task_title
        })

    # Return just the title if that's all we need
    if data.get('extract_title_only'):
        return jsonify({
            "success": True,
            "task_title": task_title
        })

    # 6-8. Database Lookup and Update Attributes
    conn = get_db_connection()
    task = conn.execute("SELECT * FROM tasks WHERE user_id = ? AND task_title LIKE ? COLLATE NOCASE", 
                       (session['user_id'], f'%{task_title}%')).fetchone()

    if not task:
        conn.close()
        return jsonify({
            "success": False,
            "message": "No matching task found"
        })

    task = dict(task)

    # Extract updates from the prompt
    update_prompt = f"""
        Parse the update details from this query. Output JSON with these fields:
        - description (string or F)
        - schedule_date (DD/MM/YYYY or F)
        - schedule_from (HH:MM 24hr format or F)
        - schedule_to (HH:MM 24hr format or F)
        - tag (STUDY/WORK/READ/OTHER or F)
        - priority (High/Medium/Low or F)
        - time_required (decimal hours or F)

        Query: {query}
        Current date: {datetime.now().strftime('%A, %d %B %Y, %H:%M')}
    """
    update_response = llm.invoke(update_prompt)
    updates = extract_json_from_llm_response(update_response)

    # 9. Prepare data for editable table
    updated_task = task.copy()
    for field in ['description', 'schedule_date', 'schedule_from', 'schedule_to', 'tag', 'priority', 'time_required']:
        if field in updates and updates[field] != 'F':
            updated_task[field] = updates[field]

    conn.close()

    return jsonify({
        "success": True,
        "original_task": task,
        "proposed_updates": updated_task
    })

@app.route('/api/search-task-date', methods=['POST'])
def search_task_date():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    data = request.json
    task_title = data.get('task_title', '').strip()
    schedule_date = data.get('schedule_date', '').strip()

    if not task_title or not schedule_date:
        return jsonify({"success": False, "message": "Task title and date are required"})

    conn = get_db_connection()
    task = conn.execute("""
        SELECT * FROM tasks 
        WHERE user_id = ? 
        AND task_title LIKE ? COLLATE NOCASE 
        AND schedule_date LIKE ? COLLATE NOCASE
    """, (session['user_id'], f'%{task_title}%', f'%{schedule_date}%')).fetchone()

    if not task:
        conn.close()
        return jsonify({
            "success": False,
            "message": "No matching task found"
        })

    result = dict(task)
    
    # Extract review from the prompt using LLM
    prompt = f"""
    You will receive a text describing a task, event, or activity. Your job is to write a short review summarizing the main actions or outcomes, focusing on what was achieved or done.

✦ Do not simply repeat the original text.
✦ Focus on the key actions, results, or commitments.
✦ Keep the review in a short, natural string.
✦ Example:

Input: Hi, I called my mom for birthday on 10th of this May, she was very happy and she promised to visit us in July this year.
Review: Successfully called mom for her birthday; she was happy and plans to visit in July.

Here’s the text:

    Text: {data.get('prompt', '')}
    Output should be a string.
    """
    
    print("DEBUG: Extracting review with prompt:", data.get('prompt', ''))
    review_response = llm.invoke(prompt)
    review = review_response.content.strip().strip('"').strip("'").strip('`')
    

    conn.close()

    return jsonify({
        "success": True,
        "task": result,
        "review":review
    })

@app.route('/api/tasks/<int:task_id>/update-from-assistant', methods=['PUT'])
def update_task_from_assistant(task_id):
    # 10-13. Handle update button press and save to database
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    data = request.json
    task_data = data.get('task')

    if not task_data:
        return jsonify({"success": False, "message": "Task data is required"})

    conn = get_db_connection()
    task = conn.execute('SELECT * FROM tasks WHERE id = ? AND user_id = ?', 
                       (task_id, session['user_id'])).fetchone()

    if not task:
        conn.close()
        return jsonify({"success": False, "message": "Task not found"})

    try:
        conn.execute('''
            UPDATE tasks SET
                task_title = ?,
                description = ?,
                priority = ?,
                time_required = ?,
                schedule_date = ?,
                schedule_from = ?,
                schedule_to = ?,
                tag = ?
            WHERE id = ? AND user_id = ?
        ''', (
            task_data['task_title'],
            task_data['description'],
            task_data['priority'],
            task_data['time_required'],
            task_data['schedule_date'],
            task_data['schedule_from'],
            task_data['schedule_to'],
            task_data['tag'],
            task_id,
            session['user_id']
        ))
        conn.commit()

        updated_task = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()
        conn.close()

        return jsonify({
            "success": True,
            "message": "Task updated successfully",
            "task": dict(updated_task)
        })

    except Exception as e:
        conn.close()
        return jsonify({
            "success": False,
            "message": f"Error updating task: {str(e)}"
        })

@app.route('/api/analytics', methods=['GET'])
def get_analytics():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    conn = get_db_connection()

    # Get completion rate
    total_tasks = conn.execute('SELECT COUNT(*) as count FROM tasks WHERE user_id = ?', 
                              (session['user_id'],)).fetchone()['count']
    completed_tasks = conn.execute('SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND completed = 1', 
                                  (session['user_id'],)).fetchone()['count']

    completion_rate = 0 if total_tasks == 0 else round((completed_tasks / total_tasks) * 100)

    # Get priority distribution
    priority_distribution = conn.execute('''
        SELECT priority, COUNT(*) as count 
        FROM tasks 
        WHERE user_id = ? 
        GROUP BY priority
    ''', (session['user_id'],)).fetchall()

    # Get tag distribution
    tag_distribution = conn.execute('''
        SELECT tag, COUNT(*) as count 
        FROM tasks 
        WHERE user_id = ? 
        GROUP BY tag
    ''', (session['user_id'],)).fetchall()

    conn.close()

    return jsonify({
        "success": True,
        "analytics": {
            "completion_rate": completion_rate,
            "priority_distribution": [dict(item) for item in priority_distribution],
            "tag_distribution": [dict(item) for item in tag_distribution],
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks
        }
    })

@app.route('/api/calendar-tasks', methods=['GET'])
def get_calendar_tasks():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    month = request.args.get('month')
    year = request.args.get('year')

    if not month or not year:
        return jsonify({"success": False, "message": "Month and year are required"})

    conn = get_db_connection()

    # Query tasks with schedule_date in the specified month
    tasks = conn.execute('''
        SELECT * FROM tasks 
        WHERE user_id = ? AND schedule_date != "F" 
        ORDER BY schedule_date, schedule_from
    ''', (session['user_id'],)).fetchall()

    conn.close()

    # Filter tasks by month and year
    filtered_tasks = []
    for task in tasks:
        try:
            task_date = datetime.strptime(task['schedule_date'], "%d/%m/%Y")
            if task_date.month == int(month) and task_date.year == int(year):
                filtered_tasks.append(dict(task))
        except (ValueError, TypeError):
            # Skip tasks with invalid dates
            continue

    return jsonify({
        "success": True,
        "tasks": filtered_tasks
    })

@app.route('/api/task-summary', methods=['GET'])
def get_task_summary():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    conn = get_db_connection()

    # Get tasks for summary
    today = datetime.now().strftime("%d/%m/%Y")

    today_tasks = conn.execute('''
        SELECT * FROM tasks 
        WHERE user_id = ? AND schedule_date = ?
        ORDER BY priority, schedule_from
    ''', (session['user_id'], today)).fetchall()

    conn.close()

    # Generate summary with LLM
    if today_tasks:
        task_list = "\n".join([
            f"- {task['task_title']} (Priority: {task['priority']}, Description: {task['description']}, Review: {task['review']}, Schedule_from: {task['schedule_from']}, Schedule_to: {task['schedule_to']})"
            for task in today_tasks
        ])

        prompt = f"""
            Generate a short summary of today's tasks. Use the reviews and description specifically for the tasks. Create a separate short paragraph for each task. Order should be chronological.

            Today's tasks:
            {task_list}
        
        """

        response = llm.invoke(prompt)
        summary = response.content.strip()
    else:
        summary = "Example summary: You don't have any tasks scheduled for today. Great job staying organized!"

    return jsonify({
        "success": True,
        "summary": summary
    })

@app.route('/api/task-summary', methods=['POST'])
def generate_task_summary():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    data = request.json
    prompt = data.get('prompt', '')

    if not prompt:
        return jsonify({"success": False, "message": "Prompt is required"})

    try:
        response = llm.invoke(prompt)
        return jsonify({
            "success": True,
            "response": response.content.strip()
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/api/llm-assistant', methods=['POST'])
def llm_assistant():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    data = request.json
    prompt = data.get('prompt', '')

    if not prompt:
        return jsonify({"success": False, "message": "Prompt is required"})

    try:
        # Step 1: Classify intent
        classification_prompt = f"""
        Classify the following user input into one of three categories:
        - CREATE_TASK
        - MODIFY_TASK
        - ADD_REVIEW

        Only output one of the three labels above.

        Input: {prompt}
        """
        classification_response = llm.invoke(classification_prompt)
        intent = classification_response.content.strip().upper()

        # Step 2: Process based on intent
        if intent == "CREATE_TASK":
            # Extract task details
            task_data = extract_task_details(prompt)
            is_valid, warnings = validate_task(task_data)

            return jsonify({
                "success": True,
                "intent": intent,
                "task_data": task_data,
                "is_valid": is_valid,
                "warnings": warnings
            })

        elif intent == "MODIFY_TASK":
            # Return a list of tasks for the user to choose from
            # Extract task title from prompt
            title_prompt = """Extract the exact task title from this update request. Output only the title."""
            title_response = llm.invoke(f"{title_prompt}\nText: {prompt}")
            task_title = title_response.content.strip()

            # Get task details from database
            conn = get_db_connection()
            task = conn.execute('SELECT * FROM tasks WHERE user_id = ? AND task_title LIKE ? COLLATE NOCASE', 
                              (session['user_id'], f'%{task_title}%')).fetchone()
            conn.close()

            # First just return the extracted title for confirmation
            return jsonify({
                "success": True,
                "intent": intent,                "task_title": task_title,
                "message": "Please confirm the task title:"
            })

        elif intent == "ADD_REVIEW":
            # Identify which task to add a review to
            assistant_prompt = f"""
            The user wants to add a review to a task. Based on the query below, identify the task title and schedule date.

            User query: {prompt}

            Respond with:
            1. The exact task title from this request
            2. The scheduled date (in DD/MM/YYYY format) today is {datetime.now().strftime('%d/%m/%Y')}

           The output should be in JSON format:
            {{
                "task_title": "...",
                "scheduled_date": "DD/MM/YYYY"
            }}
            """

            response = llm.invoke(assistant_prompt)
            extracted_data = extract_json_from_llm_response(response)
            task_title = extracted_data.get('task_title', '')
            scheduled_date = extracted_data.get('scheduled_date', datetime.now().strftime('%d/%m/%Y'))

            conn = get_db_connection()
            task = conn.execute("SELECT * FROM tasks WHERE user_id = ? AND task_title LIKE ? COLLATE NOCASE",
                (session['user_id'], f'%{task_title}%')
            ).fetchone()
            conn.close()

            return jsonify({
                "success": True,
                "intent": intent,
                "task_title": task_title,
                "scheduled_date": scheduled_date,
                "message": "Please confirm the task title and scheduled date:"
            })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
