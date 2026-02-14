from flask import Flask, render_template, request, jsonify
import sqlite3
from langchain_core.output_parsers import JsonOutputParser
from langchain_google_genai import ChatGoogleGenerativeAI
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
from typing import Optional, List
from pydantic import BaseModel, Field
from langchain_core.output_parsers import JsonOutputParser
import ast
import json
import re
import os
from datetime import datetime
from langchain_core.tools import tool
import requests

DATABASE = os.path.join("tasks.db")

api_key = "AIzaSyBh0ad5gUxamAF_QtMLjE4hpxP5VDBqGcw"  
llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", google_api_key=api_key)

now = datetime.now()
formatted_now = now.strftime("%A, %d %B %Y, %H:%M")

app = Flask(__name__)
CORS(app)

# Initialize Database
DATABASE = 'tasks.db'
@app.route('/api/llm-agent', methods=['POST'])
def llm_agent():
    data = request.json
    prompt = data.get('prompt', '')
    
    try:
        response = llm.invoke(prompt)
        return jsonify({
            "success": True,
            "response": response.content
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

def init_db():
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_title TEXT,
            description TEXT,
            priority TEXT,
            time_required TEXT,
            schedule_date TEXT,
            schedule_from TEXT,
            schedule_to TEXT,
            tag TEXT,
            review TEXT
        )
    ''')
    
    # cursor.execute("DROP TABLE tasks")
    conn.commit()
    conn.close()

init_db()


def checker(parsed_json):
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
        except Exception as e:
            print(e)
            return False


    # Fetch values
    schedule_date = parsed_json.get('schedule_date', "").strip()
    schedule_from = parsed_json.get('schedule_from', "").strip()
    schedule_to = parsed_json.get('schedule_to', "").strip()
    time_required = str(parsed_json.get('time_required',"")).strip()

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
        parsed_json['schedule_date'] = "F"
        parsed_json['schedule_from'] = "F"
        parsed_json['schedule_to'] = "F"
    has_time_required = is_present_for_bucket(time_required)

    if not (has_schedule_fields or has_time_required):
        warnings.append(
            "WARNING! You either need time required for the task or scheduled date and schedule time. These values are currently missing in your note."
        )

    return 1 if not warnings else 0, warnings

def convert_to_json(response):
    
    pattern = "```json\n(.*?)```"
    json_str = re.findall(pattern, response.content, re.DOTALL)
    print("LENGTH OF PATTERN LIST:> " + str(len(json_str)))
    if(len(json_str) < 1):
        print("None JSON generated")
        return {None}
    try:
        evaluation = json.loads(json_str[0])
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON: {e}")
        evaluation = {}
    return evaluation

def extract_task_details(text_input):
    """Calls Google Gemini API to extract structured task details from voice note text."""

    prompt = f"""
            Parse the following text and classify it into attributes:
            - task_title (generate one from the info if not explicitly provided)
            - description (generate one from the info if not explicitly provided)
            - time_required (in decimal)
            - schedule_date (DD/MM/YYYY), today is {formatted_now}
            - schedule_from (HH:MM 24hr format)
            - schedule_to (HH:MM 24hr format)
            - tag (one per task, uppercase, deafault 'OTHER')
            - priority (default 'Medium', can only hold High, Medium and Low values)
            
            Text: {text_input}
            And create a JSON type output with these attributes as keys. If you are not able to extract an attribute, fill "F" as the value
        """
    
    response = llm.invoke(prompt)
    return response



@app.route('/')
def index():
    return render_template('index.html')

# @app.route('/modifypage')
# def modifypage():
#     return render_template('modifypage.html')

@app.route('/record', methods=['POST'])
def process_voice_input():
    data = request.json
    text_input = data.get('text', '')

    # Step 1: Classify intent
    classification_prompt = f"""
    Classify the following user input into one of three categories:
    - CREATE_TASK
    - UPDATE_TASK
    - ADD_REVIEW

    Only output one of the three labels above.

    Input: {text_input}
    """
    classification_response = llm.invoke(classification_prompt)
    intent = classification_response.content.strip().upper()


    # Step 2: Extract task details and continue existing logic
    response = extract_task_details(text_input)
    print(response.content)

    json_task = convert_to_json(response)
    checker_output, warning = checker(json_task)

    return jsonify({
        "checker_output": intent,
        "warning": warning,
        "task_data": json_task
    })

@app.route('/submit_all_tasks', methods=['POST'])
def submit_all_tasks():
    
    data = request.json

    tasks = data.get("tasks", [])
    print(tasks)

    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    success_count = 0
    failed_tasks = []

    for task in tasks:
        print(task)
        check_result, warning = checker(task)
        if check_result == 1:
            try:
                cursor.execute('''
                    INSERT INTO tasks (task_title, description, priority, time_required, schedule_date, schedule_from, schedule_to,tag)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                               '''
                , (
                    task["task_title"],
                    task["description"],
                    task["priority"],
                    task["time_required"],
                    task["schedule_date"],
                    task["schedule_from"],
                    task["schedule_to"],
                    task["tag"]
                ))
                success_count += 1
            except Exception as e:
                print("Error inserting task:", e)
                failed_tasks.append({ "task": task, "error": str(e) })
        else:
            failed_tasks.append({ "task": task, "warning": warning })

    conn.commit()
    conn.close()

    return jsonify({
        "checker_output": check_result,
        "warning": warning,
    })
    
    

@app.route('/search_task', methods=['POST'])
def search_task():
    data = request.get_json()
    query = data.get("payload", "").strip()
    title_query = data.get("title_query", "")
    # print(query)
    
    if title_query is None:
        print("HIT")
        prompt = f"""
            You are an assistant that extracts the title of a task from natural language queries. Your response must be the task title only—no extra text.

            Here are a few examples:

            Query: "update the task where I am going to the gym tomorrow morning"
            Title: going to the gym

            Query: "modify the task where I have a team meeting in the afternoon"
            Title: team meeting

            Query: "change the task where I am working on the science project on Friday"
            Title: science project

            Query: "edit the task where I'm cooking dinner with friends this evening"
            Title: cooking dinner with friends

            Now extract the title from the following query:

            Query: "{query}"
            Title:
        """
        
        response = llm.invoke(prompt)
        title_query = response.content
    else:
        print("NO HIT")
        title_query = title_query.strip()
    
    prompt_extract_update_info = f"""
            Parse the following text and classify it into attributes:
            - schedule_date (DD/MM/YYYY), today is {formatted_now}
            - schedule_from (HH:MM 24hr format)
            - schedule_to (HH:MM 24hr format)
            - tag (one per task, uppercase, if not mentioned specifically put -1)
            - priority (if not mentioned specifically put -1)
            
            Text: {query}
            And create a JSON type output with these attributes as keys. If you are not able to extract an attribute, fill "-1" as the value
        """

    

    response2 = llm.invoke(prompt_extract_update_info)
    print(response2.content)
    modified_json = convert_to_json(response2)
    print("LLM Response:> " + title_query)
    
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Basic LIKE query (you could add fuzzy matching later if needed)
    cursor.execute("SELECT * FROM tasks WHERE task_title LIKE ? and (schedule_date = ? or time_required = ?)", ('%' + title_query + '%',"F", "F"))
    rows = cursor.fetchall()
    conn.close()

    results = [dict(row) for row in rows]
    
    print("Printing rows[0] contents")
    if(len(results) > 0):
        if modified_json["schedule_date"] != "-1":
            results[0]["schedule_date"] = modified_json["schedule_date"]
        if modified_json["schedule_from"] != "-1":
            results[0]["schedule_from"] = modified_json["schedule_from"]
        if modified_json["schedule_to"] != "-1":
            results[0]["schedule_to"] = modified_json["schedule_to"]
        if modified_json["tag"] != "-1":
            results[0]["tag"] = modified_json["tag"]
        if modified_json["priority"] != "-1":
            results[0]["priority"] = modified_json["priority"]
    
    return jsonify({
        "results": results,
        "title_query": title_query
    }) 
   
   
@app.route('/search_task_for_review', methods=['POST'])
def search_task_for_review():
    data = request.get_json()
    query = data.get("payload", "").strip()
    title_query = data.get("title_query", "")
    schedule_date = data.get("schedule_date", "")
    # print(query)
    
    if (title_query is None or schedule_date is None) or (title_query == "-1" or schedule_date == "-1"):
        print("HIT")
        prompt = f"""
            You are an assistant that extracts the title and schedule date of a task from natural language queries.
            Your response must be a json with keys task_title and schedule_date.
            NOTE: Date is to be extracted and sent in DD/MM/YYYY format.
            NOTE: today is {formatted_now}

            Here are a few examples:

            Query: "Hi for 3rd May 2025's Read Sapiens Task, I was able to read 25 of 30 intended pages. I shall cover the remaining ones tomorrow."
            task_title: Read Sapiens
            schedule_date: 03/05/2025
            
            Now extract the title and date from the following query:

            Query: "{query}"
        """
        
        response = llm.invoke(prompt)
        temp_json = convert_to_json(response)
        title_query = temp_json["task_title"]
        schedule_date = temp_json["schedule_date"]
        
    else:
        print("NO HIT")
        title_query = title_query.strip()
        schedule_date = schedule_date.strip()
    
    prompt_extract_review = f"""
            Parse the following text and extract a reveiw for the task:

            Here review means a summary of what was done during the task. It is kinda retrospective but not always.
            Note that if you are not able to extract review, fill "-1" as the value.
            
            Text: {query}
        """

    

    response2 = llm.invoke(prompt_extract_review)
    print(response2.content)
    review = response2.content
    # modified_json = convert_to_json(response2)
    print("LLM Response:> " + title_query)
    
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Basic LIKE query (you could add fuzzy matching later if needed)
    cursor.execute("SELECT * FROM tasks WHERE task_title LIKE ? and schedule_date LIKE ?", ('%' + title_query + '%', '%' + schedule_date + '%'))
    rows = cursor.fetchall()
    conn.close()

    results = [dict(row) for row in rows]
    
    print("Printing rows[0] contents")
    if(len(results) > 0):
        if(review != "-1"):
            results[0]["review"] = review
    
    return jsonify({
        "results": results,
        "title_query": title_query,
        "schedule_date": schedule_date
    })

   
def update_checker(updated_fields):

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
        except Exception as e:
            print(e)
            return False


    # Fetch values
    schedule_date = updated_fields['schedule_date']
    schedule_from = updated_fields['schedule_from']
    schedule_to = updated_fields['schedule_to']
    time_required = updated_fields['time_required']

    # Format validations (only if value is not "F" or empty)
    if should_validate(schedule_date) and not is_valid_date(schedule_date):
        return (0, "schedule_date is not in DD/MM/YYYY format.")

    if should_validate(schedule_from) and not is_valid_time(schedule_from):
        return (0, "schedule_from is not in valid HH:MM (24-hour) format.")

    if should_validate(schedule_to) and not is_valid_time(schedule_to):
        return (0, "schedule_to is not in valid HH:MM (24-hour) format.")

    # Check time order (only if both present and valid)
    if all(should_validate(t) and is_valid_time(t) for t in [schedule_from, schedule_to]):
        t_from = datetime.strptime(schedule_from, "%H:%M")
        t_to = datetime.strptime(schedule_to, "%H:%M")
        if t_to <= t_from:
            return (0, "schedule_to must be later than schedule_from.")

    if should_validate(time_required) and not is_valid_decimal(time_required):
        return (0, "time_required must be in decimal format without any text.")

    return (1, "")
   
    
@app.route('/modify_task', methods=['POST'])
def modify_task():
    data = request.get_json()
    
    task_id = data.get('id')
    updated_fields = data.get('fields')

    if not task_id or not updated_fields:
        return jsonify({'success': False, 'db_checks': 1, 'message': 'Missing data'}), 400

    try:
        chk_res, msg = update_checker(updated_fields=updated_fields)
        if(chk_res == 0):
            return jsonify({'success': False, 'db_checks': 0, 'message': msg})
            
        if (updated_fields['schedule_date'] == 'F' or updated_fields['schedule_date'] == '') or (updated_fields['schedule_to'] == 'F' or updated_fields['schedule_to'] == '') or (updated_fields['schedule_from'] == 'F' or updated_fields['schedule_from'] == ''):
            return jsonify({'success': False, 'db_checks': 0, 'message': 'Please fill in the schedule attributes.'})
        
        if updated_fields['time_required'] == 'F' or updated_fields['time_required'] == '':
            return jsonify({'success': False, 'db_checks': 0, 'message': 'Please fill in the time required.'})
        
        conn = sqlite3.connect(DATABASE)
        cursor = conn.cursor()
        
        # Build dynamic SQL SET clause
        set_clause = ", ".join([f"{key} = ?" for key in updated_fields])
        values = list(updated_fields.values())
        values.append(task_id)
        
        # print("Set_Clause:> "+ set_clause)
        # print("Values:> " + values)

        cursor.execute(f"UPDATE tasks SET {set_clause} WHERE id = ?", values)
        conn.commit()
        conn.close()

        return jsonify({'success': True, 'db_checks': 1, 'message': 'Task updated successfully'})
    except Exception as e:
        return jsonify({'success': False, 'db_checks': 1, 'message': str(e)}), 500


@app.route('/add_review', methods=['POST'])
def add_review():
    data = request.get_json()
    task_id = data.get("task_id")
    review = data.get("review")

    if not task_id or not review:
        return jsonify({'success': False, 'message': 'Missing data'}), 400

    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    cursor.execute("UPDATE tasks SET review = ? WHERE id = ?", (review, task_id))
    conn.commit()
    conn.close()

    return jsonify({'success': True, 'message': 'Review added successfully'})
    
### ---------------------------------------------------------------------------
@tool
def time_scheduler(a: int, b:int) -> int:
  """ """
  return a+b

@tool
def status_changer(a: int, b:int) -> int:
  """ Subtracts two numbers and return the difference"""
  return a-b

@tool
def review_updater(lst: List[int]) -> int:
  """Returns the sum of the list"""
  return sum(lst)

# tool_llm = llm.bind_tools([addition, subtraction, list_sum, get_weather])
### ---------------------------------------------------------------------------

@app.route('/get_tasks', methods=['GET'])
def get_tasks():
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    cursor.execute('SELECT task_title, description, priority, tag, time_required, schedule_date, schedule_from, schedule_to FROM tasks')
    rows = cursor.fetchall()
    conn.close()

    tasks = [
        {
            "task_title": row[0],
            "description": row[1],
            "priority": row[2],
            "tag": row[3],
            "time_required": row[4],
            "schedule_date": row[5],
            "schedule_from": row[6],
            "schedule_to": row[7]
        } for row in rows
    ]

    return jsonify(tasks)


if __name__ == '__main__':
    app.run(debug=True)