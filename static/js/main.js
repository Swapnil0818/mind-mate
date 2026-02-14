document.addEventListener('DOMContentLoaded', function() {
    // Initialize Feather icons
    feather.replace();

    // Initialize global variables
    let currentTask = null;

    // Initialize Bootstrap modals
    const taskDetailModal = new bootstrap.Modal(document.getElementById('taskDetailModal'));
    const voiceInputModal = new bootstrap.Modal(document.getElementById('voiceInputModal'));

    // Initialize tab navigation
    setupTabNavigation();

    // Load initial tasks
    loadTasks();

    // Initialize Calendar
    initCalendar();

    // Initialize Analytics
    loadAnalyticsData();

    // Setup event listeners
    setupEventListeners();

    // Setup speech recognition
    setupSpeechRecognition();

    // Helper functions
    function setupTabNavigation() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.getAttribute('data-tab');

                // Remove active class from all buttons and contents
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));

                // Add active class to clicked button and corresponding content
                button.classList.add('active');
                document.getElementById(`${tabId}-tab`).classList.add('active');

                // If calendar tab is activated, refresh it
                if (tabId === 'calendar') {
                    refreshCalendar();
                }

                // If analytics tab is activated, refresh charts
                if (tabId === 'analytics') {
                    loadAnalyticsData();
                }
            });
        });
    }

    function setupEventListeners() {
        // Setup voice input
        setupVoiceInput();

        // Setup sidebar tabs
        const sidebarTabs = document.querySelectorAll('.sidebar-tab');
        const sidebarContents = document.querySelectorAll('.sidebar-content');

        sidebarTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.getAttribute('data-sidebar-tab');

                // Remove active class from all tabs and contents
                sidebarTabs.forEach(t => t.classList.remove('active'));
                sidebarContents.forEach(c => c.classList.remove('active'));

                // Add active class to clicked tab and corresponding content
                tab.classList.add('active');
                document.getElementById(`${tabId}-content`).classList.add('active');
            });
        });

        // Save task button
        document.getElementById('saveTaskBtn').addEventListener('click', saveTask);

        // Send message to assistant
        document.getElementById('sendToAssistantBtn').addEventListener('click', sendToAssistant);
        const assistantInput = document.getElementById('assistantInput');
        assistantInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendToAssistant();
            }
        });

        // Add auto-resize functionality
        assistantInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });

        // Create task from AI button
        document.getElementById('createAssistantTaskBtn').addEventListener('click', createTaskFromAssistant);

        // Event delegation for edit buttons
        document.addEventListener('click', function(e) {
            const editBtn = e.target.closest('.edit-task-btn');
            if (editBtn) {
                const taskId = editBtn.getAttribute('data-task-id');
                editTask(taskId);
                e.stopPropagation();
                return;
            }

            const deleteBtn = e.target.closest('.delete-task-btn');
            if (deleteBtn) {
                const taskId = deleteBtn.getAttribute('data-task-id');
                // Get task data and set as current task
                fetch(`/api/tasks/${taskId}`).then(res => res.json()).then(data => {
                    if (data.success) {
                        currentTask = data.task;
                        deleteTask();
                    }
                });
                e.stopPropagation();
            }
        });

        // Voice input processing
        document.getElementById('processVoiceBtn').addEventListener('click', processVoiceInput);
        document.getElementById('createVoiceTaskBtn').addEventListener('click', createVoiceTask);

        // Task detail actions
        document.getElementById('saveReviewBtn').addEventListener('click', saveTaskReview);
        document.getElementById('completeTaskBtn').addEventListener('click', completeTask);
        document.getElementById('deleteTaskBtn').addEventListener('click', deleteTask);

        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', () => {
            window.location.href = '/logout';
        });

        // Generate summary button
        document.getElementById('generateSummaryBtn').addEventListener('click', generateTaskSummary);
    }

    function setupSpeechRecognition() {
        // Check if browser supports SpeechRecognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.log('Speech recognition not supported');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        const startRecognitionBtn = document.getElementById('startRecognitionBtn');
        const voiceStatus = document.getElementById('voiceStatus');
        const voiceTextInput = document.getElementById('voiceTextInput');

        let isRecording = false;

        startRecognitionBtn.addEventListener('click', () => {
            if (isRecording) {
                recognition.stop();
                startRecognitionBtn.classList.remove('recording');
                voiceStatus.textContent = 'Processing...';
                isRecording = false;
            } else {
                recognition.start();
                startRecognitionBtn.classList.add('recording');
                voiceStatus.textContent = 'Listening...';
                isRecording = true;
            }
        });

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            voiceTextInput.value = finalTranscript || interimTranscript;
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            voiceStatus.textContent = `Error: ${event.error}`;
            startRecognitionBtn.classList.remove('recording');
            isRecording = false;
        };

        recognition.onend = () => {
            if (isRecording) {
                startRecognitionBtn.classList.remove('recording');
                voiceStatus.textContent = 'Stopped listening';
                isRecording = false;
            }
        };
    }

    function setupVoiceInput() {
        const voiceInputBtn = document.getElementById('voiceInputBtn');
        const assistantInput = document.getElementById('assistantInput');

        // Check if browser supports SpeechRecognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            voiceInputBtn.style.display = 'none';
            console.log('Speech recognition not supported');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;  // Changed to true to prevent auto-stopping
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        let isRecording = false;

        // Remove any existing event listener
        const newVoiceBtn = voiceInputBtn.cloneNode(true);
        voiceInputBtn.parentNode.replaceChild(newVoiceBtn, voiceInputBtn);

        // Add fresh event listener
        newVoiceBtn.addEventListener('click', () => {
            if (isRecording) {
                recognition.stop();
                newVoiceBtn.classList.remove('recording');
                isRecording = false;
            } else {
                recognition.start();
                newVoiceBtn.classList.add('recording');
                isRecording = true;
                // Clear input when starting new recording
                assistantInput.value = '';
            }
        });

        recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join('');
            assistantInput.value = transcript;
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            voiceInputBtn.classList.remove('recording');
            isRecording = false;
        };

        recognition.onend = () => {
            voiceInputBtn.classList.remove('recording');
            isRecording = false;
        };
    }

    async function loadTasks() {
        try {
            const response = await fetch('/api/tasks');
            const data = await response.json();

            if (data.success) {
                renderTasks(data.tasks);
            } else {
                showAlert('Error loading tasks: ' + data.message, 'danger');
            }
        } catch (error) {
            console.error('Error loading tasks:', error);
            showAlert('Error loading tasks. Please try again.', 'danger');
        }
    }

    function markCompletedTasks() {
        document.querySelectorAll('.task-card').forEach(card => {
            const checkbox = card.querySelector('.task-complete-checkbox');
            if (checkbox && checkbox.checked) {
                card.classList.add('completed');
            } else {
                card.classList.remove('completed');
            }
        });
    }

    

    window.showTaskDetails = function(task) {
        currentTask = task;

        const detailsContent = document.getElementById('taskDetailsContent');

        // Format date if not "F"
        let dateDisplay = 'Not scheduled';
        if (task.schedule_date && task.schedule_date !== 'F') {
            dateDisplay = formatDateForDisplay(task.schedule_date);
        }

        // Format time if not "F"
        let timeDisplay = 'Not scheduled';
        if (task.schedule_from && task.schedule_from !== 'F' && task.schedule_to && task.schedule_to !== 'F') {
            timeDisplay = `${task.schedule_from} - ${task.schedule_to}`;
        }

        detailsContent.innerHTML = `
            <h4>${task.task_title}</h4>
            <p>${task.description || 'No description'}</p>
            <div class="task-details-meta">
                <div class="detail-item">
                    <strong>Priority:</strong> 
                    <span class="task-priority ${task.priority.toLowerCase()}">${task.priority}</span>
                </div>
                <div class="detail-item">
                    <strong>Tag:</strong> 
                    <span class="task-tag ${task.tag.toLowerCase()}">${task.tag}</span>
                </div>
                <div class="detail-item">
                    <strong>Date:</strong> ${dateDisplay}
                </div>
                <div class="detail-item">
                    <strong>Time:</strong> ${timeDisplay}
                </div>
                <div class="detail-item">
                    <strong>Time Required:</strong> 
                    ${task.time_required && task.time_required !== 'F' ? `${task.time_required}h` : 'Not specified'}
                </div>
                ${task.review ? `
                <div class="detail-item mt-3">
                    <strong>Review:</strong>
                    <p class="task-review">${task.review}</p>
                </div>
                ` : ''}
            </div>
        `;

        // Set review text if exists
        document.getElementById('taskReview').value = task.review || '';

        // Show or hide complete button based on task status
        const completeBtn = document.getElementById('completeTaskBtn');
        if (task.completed === 1) {
            completeBtn.classList.add('d-none');
        } else {
            completeBtn.classList.remove('d-none');
        }

        taskDetailModal.show();
    }

    async function editTask(taskId) {
        try {
            const response = await fetch(`/api/tasks/${taskId}`);
            const data = await response.json();

            if (data.success) {
                const task = data.task;
                currentTask = task;

                // Switch to Quick Add tab
                document.querySelector('.sidebar-tab[data-sidebar-tab="quick-add"]').click();

                // Fill form fields
                document.getElementById('taskTitle').value = task.task_title;
                document.getElementById('taskDescription').value = task.description || '';
                document.getElementById('taskPriority').value = task.priority;
                document.getElementById('taskTag').value = task.tag;

                if (task.time_required && task.time_required !== 'F') {
                    document.getElementById('taskTimeRequired').value = task.time_required;
                } else {
                    document.getElementById('taskTimeRequired').value = '';
                }

                if (task.schedule_date && task.schedule_date !== 'F') {
                    const parts = task.schedule_date.split('/');
                    if (parts.length === 3) {
                        const [day, month, year] = parts;
                        document.getElementById('taskScheduleDate').value = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                    }
                } else {
                    document.getElementById('taskScheduleDate').value = '';
                }

                document.getElementById('taskScheduleFrom').value = (task.schedule_from !== 'F') ? task.schedule_from : '';
                document.getElementById('taskScheduleTo').value = (task.schedule_to !== 'F') ? task.schedule_to : '';

                // Focus on title
                document.getElementById('taskTitle').focus();

                // Scroll to top of sidebar
                document.querySelector('.sidebar-card').scrollTop = 0;
            } else {
                showAlert('Error loading task: ' + data.message, 'danger');
            }
        } catch (error) {
            console.error('Error editing task:', error);
            showAlert('Error loading task for editing. Please try again.', 'danger');
        }
    }

    async function saveTask() {
        // Get form values
        const title = document.getElementById('taskTitle').value.trim();
        if (!title) {
            showAlert('Task title is required', 'warning');
            return;
        }

        const taskData = {
            task_title: title,
            description: document.getElementById('taskDescription').value.trim(),
            priority: document.getElementById('taskPriority').value,
            tag: document.getElementById('taskTag').value,
            time_required: document.getElementById('taskTimeRequired').value || 'F',
            schedule_date: 'F',
            schedule_from: 'F',
            schedule_to: 'F'
        };

        // Format schedule date if provided
        const scheduleDateInput = document.getElementById('taskScheduleDate');
        if (scheduleDateInput.value) {
            const dateObj = new Date(scheduleDateInput.value);
            const day = String(dateObj.getDate()).padStart(2, '0');
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const year = dateObj.getFullYear();
            taskData.schedule_date = `${day}/${month}/${year}`;
        }

        // Set schedule times if provided
        const scheduleFrom = document.getElementById('taskScheduleFrom').value;
        const scheduleTo = document.getElementById('taskScheduleTo').value;

        if (scheduleFrom) taskData.schedule_from = scheduleFrom;
        if (scheduleTo) taskData.schedule_to = scheduleTo;

        try {
            let url = '/api/tasks';
            let method = 'POST';

            // If editing existing task
            if (currentTask) {
                url = `/api/tasks/${currentTask.id}`;
                method = 'PUT';
            }

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ task: taskData })
            });

            const data = await response.json();

            if (data.success) {
                // Reset form
                document.getElementById('quickAddForm').reset();
                loadTasks();
                showAlert('Task saved successfully!', 'success');
            } else {
                showAlert(data.message || data.warnings.join(', '), 'warning');
            }
        } catch (error) {
            console.error('Error saving task:', error);
            showAlert('Error saving task. Please try again.', 'danger');
        }
    }

    async function processVoiceInput() {
        const textInput = document.getElementById('voiceTextInput').value;

        if (!textInput) {
            showAlert('Please provide some text to process', 'warning');
            return;
        }

        try {
            const response = await fetch('/api/process-voice', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: textInput })
            });

            const data = await response.json();

            if (data.success) {
                const warningsAlert = document.getElementById('voiceWarningsAlert');
                const extractedData = document.getElementById('extractedTaskData');
                const extractedContent = document.getElementById('extractedTaskContent');
                const createTaskBtn = document.getElementById('createVoiceTaskBtn');

                // Display any warnings
                if (data.warnings && data.warnings.length > 0) {
                    warningsAlert.textContent = data.warnings.join('\n');
                    warningsAlert.classList.remove('d-none');
                } else {
                    warningsAlert.classList.add('d-none');
                }

                // Display extracted task data
                let extractedHtml = '';
                for (const [key, value] of Object.entries(data.task_data)) {
                    extractedHtml += `<div class="extracted-field"><span>${key}:</span> ${value}</div>`;
                }

                extractedContent.innerHTML = extractedHtml;
                extractedData.classList.remove('d-none');

                // Show create task button
                createTaskBtn.classList.remove('d-none');
                createTaskBtn.setAttribute('data-task-data', JSON.stringify(data.task_data));
            } else {
                showAlert(data.message || 'Error processing input', 'danger');
            }
        } catch (error) {
            console.error('Error processing voice input:', error);
            showAlert('Error processing input. Please try again.', 'danger');
        }
    }

    async function createVoiceTask() {
        const createTaskBtn = document.getElementById('createVoiceTaskBtn');
        const taskData = JSON.parse(createTaskBtn.getAttribute('data-task-data'));

        try {
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ task: taskData })
            });

            const data = await response.json();

            if (data.success) {
                voiceInputModal.hide();
                loadTasks();
                showAlert('Task created successfully!', 'success');
            } else {
                showAlert(data.message || data.warnings.join(', '), 'warning');
            }
        } catch (error) {
            console.error('Error creating task:', error);
            showAlert('Error creating task. Please try again.', 'danger');
        }
    }

    async function saveTaskReview() {
        if (!currentTask) return;

        const reviewText = document.getElementById('taskReview').value;

        try {
            const response = await fetch(`/api/tasks/${currentTask.id}/review`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ review: reviewText })
            });

            const data = await response.json();

            if (data.success) {
                taskDetailModal.hide();
                loadTasks();
                showAlert('Review added successfully!', 'success');

                // Add confirmation message in chat
                const messagesContainer = document.getElementById('assistantMessages');
                const confirmationMessage = document.createElement('div');
                confirmationMessage.className = 'assistant-message';
                confirmationMessage.innerHTML = `
                    <div class="message-content">
                        ✅ Review added successfully! Your progress has been saved.
                    </div>
                `;
                messagesContainer.appendChild(confirmationMessage);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            } else {
                showAlert(data.message, 'danger');
            }
        } catch (error) {
            console.error('Error saving review:', error);
            showAlert('Error saving review. Please try again.', 'danger');
        }
    }

    async function completeTask() {
        if (!currentTask) return;

        try {
            const response = await fetch(`/api/tasks/${currentTask.id}/complete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success) {
                taskDetailModal.hide();
                loadTasks();
                showAlert('Task marked as completed!', 'success');
            } else {
                showAlert(data.message, 'danger');
            }
        } catch (error) {
            console.error('Error completing task:', error);
            showAlert('Error completing task. Please try again.', 'danger');
        }
    }

    async function deleteTask() {
        if (!currentTask) return;

        if (!confirm('Are you sure you want to delete this task?')) {
            return;
        }

        try {
            const response = await fetch(`/api/tasks/${currentTask.id}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                taskDetailModal.hide();
                loadTasks();
                showAlert('Task deleted successfully!', 'success');
            } else {
                showAlert(data.message, 'danger');
            }
        } catch (error) {
            console.error('Error deleting task:', error);
            showAlert('Error deleting task. Please try again.', 'danger');
        }
    }

    async function sendToAssistant() {
        const messageInput = document.getElementById('assistantInput');
        const messagesContainer = document.getElementById('assistantMessages');
        const createTaskBtn = document.getElementById('createAssistantTaskBtn');
        const message = messageInput.value.trim();

        console.log("Sending message:", message);

        if (!message) return;

        // Add user message to the chat
        const userMessageElement = document.createElement('div');
        userMessageElement.className = 'assistant-message user-message';
        userMessageElement.innerHTML = `<div class="message-content">${message}</div>`;
        messagesContainer.appendChild(userMessageElement);

        // Clear input
        messageInput.value = '';

        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Add loading message
        const loadingElement = document.createElement('div');
        loadingElement.className = 'assistant-message';
        loadingElement.innerHTML = `<div class="message-content">Thinking...</div>`;
        messagesContainer.appendChild(loadingElement);

        try {
            const response = await fetch('/api/llm-assistant', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prompt: message })
            });

            const data = await response.json();

            // Handle different intents based on the response
            const intent = data.intent;

            // Remove loading message
            messagesContainer.removeChild(loadingElement);

            if (intent === "MODIFY_TASK") {
                console.log("MODIFY_TASK data received:", data);

                const assistantMessageElement = document.createElement('div');
                assistantMessageElement.className = 'assistant-message';
                if (data.success && data.task_title) {
                    const taskTitle = data.task_title;
                    console.log("Task title extracted:", taskTitle);
                    assistantMessageElement.innerHTML = `
                        <div class="message-content">
                            <p>I found this task. Please confirm the title:</p>
                            <div class="mb-3">
                                <input type="text" class="form-control" id="extractedTaskTitle" value="${taskTitle}">
                            </div>
                            <button class="btn btn-primary btn-sm mb-3" id="confirmTitleBtn">
                                <i data-feather="check"></i> Confirm Title
                            </button>
                        </div>
                    `;
                    messagesContainer.appendChild(assistantMessageElement);

                    // Add event listener for the confirm button
                    const confirmTitleBtn = document.getElementById('confirmTitleBtn');
                    if (confirmTitleBtn) {
                        // Clone and replace button to remove old event listeners
                        const newConfirmBtn = confirmTitleBtn.cloneNode(true);
                        confirmTitleBtn.parentNode.replaceChild(newConfirmBtn, confirmTitleBtn);

                        // Add fresh event listener
                        newConfirmBtn.addEventListener('click', () => {
                            const updatedTitle = document.getElementById('extractedTaskTitle').value;
                            // Force the message to use the updated title
                            // Get the user-edited title from the input
                            const userEditedTitle = document.getElementById('extractedTaskTitle').value;
                            // Use the user-edited title in the message
                            const updatedMessage = message.replace(/\b(update|modify|change|edit).*?(task|activity)/i, `update task "${userEditedTitle}"`);
                            // Use the user-edited title for the task search
                            fetch('/api/search-task', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ 
                                    query: updatedMessage,
                                    title_query: userEditedTitle
                                })
                            })
                            .then(response => response.json())
                            .then(data => {
                                if (data.success) {
                                    // Show the update options
                                    showUpdateOptions(data, assistantMessageElement);
                                } else {
                                    showError(data.message, assistantMessageElement);
                                }
                            });
                        });
                    }
                } else {
                    assistantMessageElement.innerHTML = `
                        <div class="message-content">
                            <p>${data.message}</p>
                        </div>
                    `;
                    messagesContainer.appendChild(assistantMessageElement);
                }
            } else if (intent === "CREATE_TASK") {
                // Display the extracted task details in a table format
                const taskData = data.task_data;
                const warnings = data.warnings || [];

                // Create response message
                const assistantMessageElement = document.createElement('div');
                assistantMessageElement.className = 'assistant-message';
                assistantMessageElement.innerHTML = `
                    <div class="message-content">
                        <div class="task-attributes-table">
                            <table class="table table-sm">
                                <tbody>
                                    <tr>
                                        <td>Title</td>
                                        <td><input type="text" class="form-control form-control-sm task-attr-input" data-field="task_title" value="${taskData.task_title || ''}"></td>
                                    </tr>
                                    <tr>
                                        <td>Description</td>
                                        <td><textarea class="form-control form-control-sm task-attr-input" data-field="description" rows="2">${taskData.description || ''}</textarea></td>
                                    </tr>
                                    <tr>
                                        <td>Priority</td>
                                        <td>
                                            <select class="form-select form-select-sm task-attr-input" data-field="priority">
                                                <option value="High" ${taskData.priority === 'High' ? 'selected' : ''}>High</option>
                                                <option value="Medium" ${taskData.priority === 'Medium' || !taskData.priority ? 'selected' : ''}>Medium</option>
                                                <option value="Low" ${taskData.priority === 'Low' ? 'selected' : ''}>Low</option>
                                            </select>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>Tag</td>
                                        <td>
                                            <select class="form-select form-select-sm task-attr-input" data-field="tag">
                                                <option value="STUDY" ${taskData.tag === 'STUDY' ? 'selected' : ''}>STUDY</option>
                                                <option value="WORK" ${taskData.tag === 'WORK' ? 'selected' : ''}>WORK</option>
                                                <option value="READ" ${taskData.tag === 'READ' ? 'selected' : ''}>READ</option>
                                                <option value="OTHER" ${taskData.tag === 'OTHER' || !taskData.tag ? 'selected' : ''}>OTHER</option></select>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>Time Required (hours)</td>
                                        <td><input type="number" step="0.1" class="form-control form-control-sm task-attr-input" data-field="time_required" value="${taskData.time_required && taskData.time_required !== 'F' ? taskData.time_required : ''}"></td>
                                    </tr>
                                    <tr>
                                        <td>Schedule Date</td>
                                        <td><input type="date" class="form-control form-control-sm task-attr-input" data-field="schedule_date" value="${taskData.schedule_date && taskData.schedule_date !== 'F' ? formatDateForInput(taskData.schedule_date) : ''}"></td>
                                    </tr>
                                    <tr>
                                        <td>From Time</td>
                                        <td><input type="time" class="form-control form-control-sm task-attr-input" data-field="schedule_from" value="${taskData.schedule_from && taskData.schedule_from !== 'F' ? taskData.schedule_from : ''}"></td>
                                    </tr>
                                    <tr>
                                        <td>To Time</td>
                                        <td><input type="time" class="form-control form-control-sm task-attr-input" data-field="schedule_to" value="${taskData.schedule_to && taskData.schedule_to !== 'F' ? taskData.schedule_to : ''}"></td>
                                    </tr>
                                </tbody>
                            </table>
                            ${warnings.length > 0 ? 
                                `<div class="alert alert-warning">
                                    <small>${warnings.join('<br>')}</small>
                                </div>` : ''
                            }
                            <button class="btn btn-primary btn-sm w-100" id="createTaskFromTableBtn">Create Task</button>
                        </div>
                    </div>
                `;
                messagesContainer.appendChild(assistantMessageElement);

                // Add event listener for the create button
                setTimeout(() => {
                    document.getElementById('createTaskFromTableBtn').addEventListener('click', () => createTaskFromTable(messagesContainer));
                }, 0);

            } else if (intent === "ADD_REVIEW") {
                // Add assistant response with task selection
                const assistantMessageElement = document.createElement('div');
                assistantMessageElement.className = 'assistant-message';
                if (data.success && data.task_title && data.scheduled_date) {
                    const taskTitle = data.task_title;
                    const scheduledDate = data.scheduled_date;
                    console.log("Task title:", taskTitle, "Scheduled date:", scheduledDate);
                    assistantMessageElement.innerHTML = `
                        <div class="message-content">
                            <p>I found this task. Please confirm the title and date:</p>
                            <div class="mb-3">
                                <input type="text" class="form-control" id="extractedTaskTitle" value="${taskTitle}">
                                <input type="text" class="form-control mt-2" id="extractedScheduleDate" value="${scheduledDate}">
                            </div>
                            <button class="btn btn-primary btn-sm mb-3" id="confirmTitleBtn">
                                <i data-feather="check"></i> Confirm Details
                            </button>
                        </div>
                    `;
                    messagesContainer.appendChild(assistantMessageElement);

                    // Add event listener for the confirm button
                    setTimeout(() => {
                        const confirmTitleBtn = document.getElementById('confirmTitleBtn');
                        if (confirmTitleBtn) {
                            // Remove any existing event listeners
                            const newConfirmBtn = confirmTitleBtn.cloneNode(true);
                            confirmTitleBtn.parentNode.replaceChild(newConfirmBtn, confirmTitleBtn);

                            // Add fresh event listener
                            newConfirmBtn.addEventListener('click', () => {
                                const updatedTitle = document.getElementById('extractedTaskTitle').value;
                                const updatedDate = document.getElementById('extractedScheduleDate').value;
                                // Send title to backend for next step
                                fetch('/api/search-task-date', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({ 
                                        task_title: updatedTitle,
                                        schedule_date: updatedDate,
                                        prompt: message
                                    })
                                })
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success && data.task) {
                                        console.log(data.task);
                                        const review = data.review || '';

                                        console.log("Review extracted:", data.task['review']);

                                        // Create review input interface in chat
                                        const reviewInterface = document.createElement('div');
                                        reviewInterface.className = 'message-content mt-3';
                                        reviewInterface.innerHTML = `
                                            <p>I extracted this review. You can edit it before adding:</p>
                                            <div class="mb-3">
                                                <textarea class="form-control" id="chatReviewText" rows="3">${review}</textarea>
                                            </div>
                                            <button class="btn btn-success btn-sm" id="addReviewFromChat">
                                                Add Review
                                            </button>
                                        `;
                                        assistantMessageElement.appendChild(reviewInterface);

                                        // Add event listener for the add review button if element exists
                                        const addReviewBtn = document.getElementById('addReviewFromChat');
                                        if (addReviewBtn) {
                                            // Remove any existing event listeners
                                            const newBtn = addReviewBtn.cloneNode(true);
                                            addReviewBtn.parentNode.replaceChild(newBtn, addReviewBtn);

                                            newBtn.addEventListener('click', async () => {
                                                const reviewText = document.getElementById('chatReviewText').value;
                                                try {
                                                    const response = await fetch(`/api/tasks/${data.task.id}/review`, {
                                                        method: 'POST',
                                                        headers: {
                                                            'Content-Type': 'application/json'
                                                        },
                                                        body: JSON.stringify({ review: reviewText })
                                                    });
                                                    const result = await response.json();
                                                    if (result.success) {
                                                        // Add success message
                                                        const successMsg = document.createElement('div');
                                                        successMsg.className = 'message-content mt-2';
                                                        successMsg.innerHTML = '<p class="text-success">✅ Review added successfully!</p>';
                                                        assistantMessageElement.appendChild(successMsg);
                                                        loadTasks(); // Refresh task list
                                                    }
                                                } catch (error) {
                                                    console.error('Error:', error);
                                                    showError('Error adding review', assistantMessageElement);
                                                }
                                            });
                                        }
                                    } else {
                                        showError(data.message || 'Task not found', assistantMessageElement);
                                    }
                                })
                                .catch(error => {
                                    console.error('Error:', error);
                                    showError('Error processing request', assistantMessageElement);
                                });
                            });
                            feather.replace();
                        }
                    }, 100);
                } else {
                    assistantMessageElement.innerHTML = `
                        <div class="message-content">
                            <p>${data.message}</p>
                        </div>
                    `;
                    messagesContainer.appendChild(assistantMessageElement);
                }
            } else {
                // General query - just show the response
                const assistantMessageElement = document.createElement('div');
                assistantMessageElement.className = 'assistant-message';
                assistantMessageElement.innerHTML = `<div class="message-content">${data.response}</div>`;
                messagesContainer.appendChild(assistantMessageElement);
            }

            // Scroll to bottom
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        } catch (error) {
            console.error('Error sending message to assistant:', error);
            console.log('Full error details:', {
                error: error,
                message: error.message,
                stack: error.stack
            });

            // Remove loading message
            messagesContainer.removeChild(loadingElement);

            // Add error message
            const errorMessageElement = document.createElement('div');
            errorMessageElement.className = 'assistant-message';
            errorMessageElement.innerHTML = `<div class="message-content">Sorry, I encountered an error. Please try again.</div>`;
            messagesContainer.appendChild(errorMessageElement);

            // Scroll to bottom
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    async function generateTaskSummary() {
        try {
            const response = await fetch('/api/task-summary');
            const data = await response.json();

            if (data.success) {
                document.getElementById('taskSummaryText').textContent = data.summary;
            } else {
                showAlert(data.message, 'danger');
            }
        } catch (error) {
            console.error('Error generating summary:', error);
            showAlert('Error generating summary. Please try again.', 'danger');
        }
    }

    async function createTaskFromAssistant() {
        const messagesContainer = document.getElementById('assistantMessages');
        const lastUserMessage = Array.from(messagesContainer.getElementsByClassName('user-message')).pop();

        if (!lastUserMessage) {
            showAlert('Please describe your task to the assistant first', 'warning');
            return;
        }

        try {
            const taskDescription = lastUserMessage.querySelector('.message-content').textContent;
            const createTaskBtn = document.getElementById('createAssistantTaskBtn');

            // Show loading state
            createTaskBtn.textContent = 'Processing...';
            createTaskBtn.disabled = true;

            // Process the task description using the voice processing API (which extracts task details)
            const response = await fetch('/api/process-voice', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: taskDescription })
            });

            const data = await response.json();

            if (data.success) {
                // Create the task with the extracted data
                const taskResponse = await fetch('/api/tasks', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ task: data.task_data })
                });

                const taskData = await taskResponse.json();

                if (taskData.success) {
                    // Add success message to chat
                    const successMsg = document.createElement('div');
                    successMsg.className = 'assistant-message';
                    successMsg.innerHTML = `<div class="message-content">I've created a task for you: <strong>${data.task_data.task_title}</strong>.</div>`;
                    messagesContainer.appendChild(successMsg);

                    // Scroll to bottom
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;

                    // Reload tasks
                    loadTasks();
                } else {
                    // Add error message to chat
                    const errorMsg = document.createElement('div');
                    errorMsg.className = 'assistant-message';
                    errorMsg.innerHTML = `<div class="message-content">Sorry, I couldn't create the task: ${taskData.message || taskData.warnings?.join(', ')}</div>`;
                    messagesContainer.appendChild(errorMsg);

                    // Scroll to bottom
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
            } else {
                // Add error message to chat
                const errorMsg = document.createElement('div');
                errorMsg.className = 'assistant-message';
                errorMsg.innerHTML = `<div class="message-content">Sorry, I couldn't understand the task details. Please provide more information.</div>`;
                messagesContainer.appendChild(errorMsg);

                // Scroll to bottom
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        } catch (error) {
            console.error('Error creating task from assistant:', error);

            // Add error message to chat
            const errorMsg = document.createElement('div');
            errorMsg.className = 'assistant-message';
            errorMsg.innerHTML = `<div class="message-content">Sorry, I encountered an error while creating your task. Please try again.</div>`;
            messagesContainer.appendChild(errorMsg);

            // Scroll to bottom
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        } finally {
            // Reset button state
            createTaskBtn.textContent = 'Create Task from AI';
            createTaskBtn.disabled = false;
        }
    }

    async function createTaskFromTable(messagesContainer) {
        // Collect all input values from the table
        const taskData = {};
        const inputs = document.querySelectorAll('.task-attr-input');

        inputs.forEach(input => {
            const field = input.getAttribute('data-field');
            taskData[field] = input.value || 'F'; // Set 'F' as default for empty values
        });

        // For date field, convert from YYYY-MM-DD to DD/MM/YYYY if present
        if (taskData.schedule_date && taskData.schedule_date !== 'F') {
            const [year, month, day] = taskData.schedule_date.split('-');
            if (year && month && day) {
                taskData.schedule_date = `${day}/${month}/${year}`;
            }
        }

        // Validate task first
        try {
            const validateResponse = await fetch('/api/validate-task', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ task: taskData })
            });

            const validationData = await validateResponse.json();

            if (!validationData.success && validationData.warnings) {
                // Show validation warnings in the chat
                const warningMessageElement = document.createElement('div');
                warningMessageElement.className = 'assistant-message';
                warningMessageElement.innerHTML = `
                    <div class="message-content">
                        <p>⚠️ Please fix these issues:</p>
                        <ul>
                            ${validationData.warnings.map(warning => `<li>${warning}</li>`).join('')}
                        </ul>
                    </div>
                `;
                messagesContainer.appendChild(warningMessageElement);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                return; // Stop task creation if validation fails
            }
        } catch (error) {
            console.error('Error validating task:', error);
            const errorMessageElement = document.createElement('div');
            errorMessageElement.className = 'assistant-message';
            errorMessageElement.innerHTML = `
                <div class="message-content">
                    <p>❌ Error validating task data. Please try again.</p>
                </div>
            `;
            messagesContainer.appendChild(errorMessageElement);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            return;
        }

        try {
            // Disable the create button to prevent double submission
            const createBtn = document.getElementById('createTaskFromTableBtn');
            createBtn.disabled = true;
            createBtn.textContent = 'Creating...';

            // Send the task data to be created
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ task: taskData })
            });

            const data = await response.json();

            // Add a message to the chat about the result
            const resultMessageElement = document.createElement('div');
            resultMessageElement.className = 'assistant-message';

            if (data.success) {
                // Remove the task creation interface
                const taskAttributesTable = document.querySelector('.task-attributes-table');
                if (taskAttributesTable) {
                    taskAttributesTable.remove();
                }

                // Generate task summary using LLM
                fetch('/api/task-summary', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        prompt: `A new task was created with the following details. Kindly generate asummary of this task creation as a message to assure user that this task was created:
                            Title: ${taskData.task_title}
                            Description: ${taskData.description}
                            Priority: ${taskData.priority}
                            Tag: ${taskData.tag}
                            Time Required: ${taskData.time_required}
                            Schedule Date: ${taskData.schedule_date} it is in DD/MM/YYYY format
                            Schedule Time: ${taskData.schedule_from} - ${taskData.schedule_to}`
                    })
                })
                .then(response => response.json())
                .then(summaryData => {
                    resultMessageElement.innerHTML = `
                        <div class="message-content">
                            <p>✅ Task created successfully!</p>
                            <div class="task-summary mt-2">
                                ${summaryData.response}
                            </div>
                        </div>
                    `;
                })
                .catch(() => {
                    resultMessageElement.innerHTML = `
                        <div class="message-content">
                            <p>✅ Task created successfully: <strong>${taskData.task_title}</strong></p>
                        </div>
                    `;
                });

                // Reload the task list to show the new task
                loadTasks();
            } else {
                let errorMsg = data.message || "There was an error creating the task.";
                if (data.warnings && data.warnings.length > 0) {
                    errorMsg = data.warnings.join('<br>');
                }

                resultMessageElement.innerHTML = `
                    <div class="message-content">
                        <p>❌ Could not create the task:</p>
                        <div class="alert alert-danger">
                            <small>${errorMsg}</small>
                        </div>
                        <p>Please correct the issues and try again.</p>
                    </div>
                `;

                // Re-enable the create button
                createBtn.disabled = false;
                createBtn.textContent = 'Create Task';
            }

            messagesContainer.appendChild(resultMessageElement);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

        } catch (error) {
            console.error('Error creating task from table:', error);

            // Show error message
            const errorMessageElement = document.createElement('div');
            errorMessageElement.className = 'assistant-message';
            errorMessageElement.innerHTML = `
                <div class="message-content">
                    <p>❌ Error creating task. Please try again.</p>
                </div>
            `;
            messagesContainer.appendChild(errorMessageElement);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

            // Re-enable the create button
            const createBtn = document.getElementById('createTaskFromTableBtn');
            createBtn.disabled = false;
            createBtn.textContent = 'Create Task';
        }
    }

    function showAlert(message, type) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show fixed-top mx-auto mt-3`;
        alertDiv.style.width = '80%';
        alertDiv.style.maxWidth = '500px';
        alertDiv.style.zIndex = '9999';

        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;

        document.body.appendChild(alertDiv);

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            alertDiv.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(alertDiv);
            }, 150);
        }, 5000);
    }

    // Initialize everything
    feather.replace();
});

// Global alert function
function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show fixed-top mx-auto mt-3`;
    alertDiv.style.width = '80%';
    alertDiv.style.maxWidth = '500px';
    alertDiv.style.zIndex = '9999';

    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    document.body.appendChild(alertDiv);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        alertDiv.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(alertDiv);
        }, 150);
    }, 5000);
}

function markCompletedTasks() {
    document.querySelectorAll('.task-card').forEach(card => {
        const checkbox = card.querySelector('.task-complete-checkbox');
        if (checkbox && checkbox.checked) {
            card.classList.add('completed');
        } else {
            card.classList.remove('completed');
        }
    });
}

function renderTasks(tasks) {
    const taskListElement = document.getElementById('taskList');
    const completedTaskListElement = document.getElementById('completedTaskList');

    // Clear existing tasks
    taskListElement.innerHTML = '';
    completedTaskListElement.innerHTML = '';

    if (tasks.length === 0) {
        taskListElement.innerHTML = '<div class="text-center text-secondary py-5">No tasks found. Click the + button to add a task.</div>';
        completedTaskListElement.innerHTML = '<div class="text-center text-secondary py-5">No completed tasks yet.</div>';
        return;
    }

    // Separate completed and pending tasks
    const pendingTasks = tasks.filter(task => task.completed !== 1);
    const completedTasks = tasks.filter(task => task.completed === 1);

    // Render pending tasks
    if (pendingTasks.length === 0) {
        taskListElement.innerHTML = '<div class="text-center text-secondary py-5">No pending tasks. Great job!</div>';
    } else {
        pendingTasks.forEach(task => {
            taskListElement.appendChild(createTaskCard(task));
        });
    }

    // Render completed tasks
    if (completedTasks.length === 0) {
        completedTaskListElement.innerHTML = '<div class="text-center text-secondary py-5">No completed tasks yet.</div>';
    } else {
        completedTasks.forEach(task => {
            completedTaskListElement.appendChild(createTaskCard(task));
        });
    }

    // Apply completed styling to tasks
    markCompletedTasks();
}

window.loadTasks = async function() {
    try {
        const response = await fetch('/api/tasks');
        const data = await response.json();

        if (data.success) {
            renderTasks(data.tasks);
        } else {
            showAlert('Error loading tasks: ' + data.message, 'danger');
        }
    } catch (error) {
        console.error('Error loading tasks:', error);
        showAlert('Error loading tasks. Please try again.', 'danger');
    }
}

async function updateTask(taskId, updatedTaskData) {
    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ task: updatedTaskData })
        });
        const data = await response.json();
        if (data.success) {
            showAlert('Task updated successfully!', 'success');
            loadTasks();

            // Add confirmation message in chat
            const messagesContainer = document.getElementById('assistantMessages');
            const confirmationMessage = document.createElement('div');
            confirmationMessage.className = 'assistant-message';
            confirmationMessage.innerHTML = `
                <div class="message-content">
                    ✅ Task updated successfully! The changes have been saved to the database.
                </div>
            `;
            messagesContainer.appendChild(confirmationMessage);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        } else {
            showAlert('Error updating task: ' + data.message, 'danger');
        }
    } catch (error) {
        console.error('Error updating task:', error);
        showAlert('Error updating task. Please try again.', 'danger');
    }
}

function formatDateForDisplay(dateString) {
    const parts = dateString.split('/');
    if (parts.length === 3) {
        const [day, month, year] = parts;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return '';
}

function formatDateForInput(dateString) {
    const parts = dateString.split('/');
    if (parts.length === 3) {
        const [day, month, year] = parts;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return '';
}

function showUpdateOptions(data, container) {
    const task = data.original_task;
    const updates = data.proposed_updates;

    // Clear existing content first
    container.innerHTML = `
        <div class="message-content">
            <p>I found the task. Here are the current details:</p>
        </div>
    `;

    const updateOptionsHtml = `
        <div class="message-content update-options">
            <p>Update task details:</p>
            <div class="task-attributes-table">
                <table class="table table-sm">
                    <tbody>
                        <tr>
                            <td>Title</td>
                            <td><input type="text" class="form-control form-control-sm task-attr-input" data-field="task_title" value="${task.task_title || ''}"></td>
                        </tr>
                        <tr>
                            <td>Description</td>
                            <td><textarea class="form-control form-control-sm task-attr-input" data-field="description" rows="2">${task.description || ''}</textarea></td>
                        </tr>
                        <tr>
                            <td>Priority</td>
                            <td>
                                <select class="form-select form-select-sm task-attr-input" data-field="priority">
                                    <option value="High" ${updates.priority === 'High' ? 'selected' : ''}>High</option>
                                    <option value="Medium" ${updates.priority === 'Medium' ? 'selected' : ''}>Medium</option>
                                    <option value="Low" ${updates.priority === 'Low' ? 'selected' : ''}>Low</option>
                                </select>
                            </td>
                        </tr>
                        <tr>
                            <td>Tag</td>
                            <td>
                                <select class="form-select form-select-sm task-attr-input" data-field="tag">
                                    <option value="STUDY" ${updates.tag === 'STUDY' ? 'selected' : ''}>STUDY</option>
                                    <option value="WORK" ${updates.tag === 'WORK' ? 'selected' : ''}>WORK</option>
                                    <option value="READ" ${updates.tag === 'READ' ? 'selected' : ''}>READ</option>
                                    <option value="OTHER" ${updates.tag === 'OTHER' ? 'selected' : ''}>OTHER</option>
                                </select>
                            </td>
                        </tr>
                        <tr>
                            <td>Time Required (hours)</td>
                            <td><input type="number" step="0.1" class="form-control form-control-sm task-attr-input" data-field="time_required" value="${updates.time_required && updates.time_required !== 'F' ? updates.time_required : ''}"></td>
                        </tr>
                        <tr>
                            <td>Schedule Date</td>
                            <td><input type="date" class="form-control form-control-sm task-attr-input" data-field="schedule_date" value="${updates.schedule_date && updates.schedule_date !== 'F' ? formatDateForInput(updates.schedule_date) : ''}"></td>
                        </tr>
                        <tr>
                            <td>From Time</td>
                            <td><input type="time" class="form-control form-control-sm task-attr-input" data-field="schedule_from" value="${updates.schedule_from && updates.schedule_from !== 'F' ? updates.schedule_from : ''}"></td>
                        </tr>
                        <tr>
                            <td>To Time</td>
                            <td><input type="time" class="form-control form-control-sm task-attr-input" data-field="schedule_to" value="${updates.schedule_to && updates.schedule_to !== 'F' ? updates.schedule_to : ''}"></td>
                        </tr>
                    </tbody>
                </table>
                <button class="btn btn-primary btn-sm w-100 mt-3" id="updateTaskBtn">
                    Update Task
                </button>
            </div>
        </div>
    `;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = updateOptionsHtml;
    container.appendChild(tempDiv.firstElementChild);

    // Add event listener to the update button with fresh handler
    const updateBtn = container.querySelector('#updateTaskBtn');
    if (updateBtn) {
        // Remove any existing listeners by cloning
        const newUpdateBtn = updateBtn.cloneNode(true);
        updateBtn.parentNode.replaceChild(newUpdateBtn, updateBtn);

        // Add fresh event listener
        newUpdateBtn.addEventListener('click', () => updateTaskFromForm(task.id));
    }
}

async function updateTaskFromForm(taskId) {
    try {
        const taskData = {};
        const inputs = document.querySelectorAll('.task-attr-input');

        inputs.forEach(input => {
            const field = input.getAttribute('data-field');
            taskData[field] = input.value || 'F';
        });

        // Convert date format if present
        if (taskData.schedule_date && taskData.schedule_date !== 'F') {
            const [year, month, day] = taskData.schedule_date.split('-');
            taskData.schedule_date = `${day}/${month}/${year}`;
        }

        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ task: taskData })
        });

        const data = await response.json();
        if (data.success) {
            showAlert('Task updated successfully!', 'success');
            loadTasks();

            // Add confirmation message in chat
            const messagesContainer = document.getElementById('assistantMessages');
            const confirmationMessage = document.createElement('div');
            confirmationMessage.className = 'assistant-message';
            confirmationMessage.innerHTML = `
                <div class="message-content">
                    ✅ Task updated successfully! The changes have been saved to the database.
                </div>
            `;
            messagesContainer.appendChild(confirmationMessage);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        } else {
            showAlert('Error updating task: ' + data.message, 'danger');
        }
    } catch (error) {
        console.error('Error updating task:', error);
        showAlert('Error updating task. Please try again.', 'danger');
    }
}

function showError(message, container) {
    container.innerHTML += `
        <div class="message-content">
            <p class="text-danger">${message}</p>
        </div>
    `;
}


function createTaskCard(task) {
    console.log('Creating task card for task:', task); // Debug log
    const taskCard = document.createElement('div');
    taskCard.className = `task-card ${task.priority.toLowerCase()}-priority tag-${task.tag.toLowerCase()}`;
    taskCard.setAttribute('data-task-id', task.id);

    // Format date if not "F"
    let dateDisplay = '';
    if (task.schedule_date && task.schedule_date !== 'F') {
        dateDisplay = formatDateForDisplay(task.schedule_date);
    }

    // Format time if not "F"
    let timeDisplay = '';
    if (task.schedule_from && task.schedule_from !== 'F' && task.schedule_to && task.schedule_to !== 'F') {
        timeDisplay = `${task.schedule_from} - ${task.schedule_to}`;
    }

    taskCard.innerHTML = `
        <div class="task-header">
            <div class="task-checkbox">
                <input type="checkbox" class="task-complete-checkbox" ${task.completed === 1 ? 'checked' : ''}>
            </div>
            <h5 class="task-title">${task.task_title}</h5>
            <button class="task-delete-btn" data-task-id="${task.id}" title="Delete Task">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
            </button>
        </div>
        <div class="task-description">${task.description || 'No description'}</div>
        ${task.review ? `<div class="task-review"><i class="fas fa-book-reader"></i> Progress: ${task.review}</div>` : ''}
        <div class="task-meta">
            <div class="task-tags">
                ${task.time_required && task.time_required !== 'F' ? `<div class="task-duration">Time Required: ${task.time_required}hrs</div>` : ''}
            </div>
            <div class="task-schedule">
                ${timeDisplay ? `<div class="task-time">Time: ${timeDisplay}</div>` : ''}
            </div>
        </div>
    `;

    taskCard.addEventListener('click', (e) => {
        // Don't open details if clicking on action buttons or checkbox
        if (!e.target.closest('.task-action-btn') && !e.target.closest('.task-checkbox')) {
            showTaskDetails(task);
        }
    });

    // Add event listeners
    const checkbox = taskCard.querySelector('.task-complete-checkbox');
    if (checkbox) {
        checkbox.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                const response = await fetch(`/api/tasks/${task.id}/complete`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                const data = await response.json();

                if (data.success) {
                    taskCard.remove();
                    if (checkbox.checked) {
                        document.getElementById('completedTaskList').appendChild(taskCard);
                        taskCard.classList.add('completed');
                    } else {
                        document.getElementById('taskList').appendChild(taskCard);
                        taskCard.classList.remove('completed');
                    }
                    showAlert('Task status updated', 'success');
                } else {
                    showAlert('Error updating task status', 'danger');
                    checkbox.checked = task.completed === 1;
                }
            } catch (error) {
                console.error('Error updating task status:', error);
                showAlert('Error updating task status', 'danger');
                checkbox.checked = task.completed === 11;
            }
        });
    }
    const editBtn = taskCard.querySelector('.edit-task-btn');
    const deleteBtn = taskCard.querySelector('.task-delete-btn');

    console.log('Delete button found:', deleteBtn); // Debug log

    if (editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent card click event
            editTask(task.id);
        });
    }

    // Attach delete button event listener
    if (deleteBtn) {
        console.log('Attaching delete event listener for task:', task.id); // Debug log
        deleteBtn.addEventListener('click', async (e) => {
            console.log('Delete button clicked for task:', taskId); // Debug log
            e.stopPropagation(); // Prevent card click event
            e.preventDefault(); // Prevent any default behavior

            if (confirm('Are you sure you want to delete this task?')) {
                try {
                    const response = await fetch(`/api/tasks/${taskId}`, {
                        method: 'DELETE'
                    });
                    const data = await response.json();

                    console.log('Delete response:', data); // Debug log

                    if (data.success) {
                        taskCard.remove();
                        showAlert('Task deleted successfully!', 'success');
                        loadTasks(); // Refresh task list
                    } else {
                        showAlert('Error deleting task: ' + data.message, 'danger');
                    }
                } catch (error) {
                    console.error('Error deleting task:', error);
                    showAlert('Error deleting task. Please try again.', 'danger');
                }
            }
        });
    }

    return taskCard;
}