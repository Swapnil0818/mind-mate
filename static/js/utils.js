// Utility functions for the task management application

// Format date functions
function formatDate(date) {
    if (!date) return '';
    
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    return new Date(date).toLocaleDateString('en-US', options);
}

function formatDateString(dateStr) {
    if (!dateStr || dateStr === 'F') return '';
    
    // Convert from DD/MM/YYYY format
    const [day, month, year] = dateStr.split('/');
    const date = new Date(`${year}-${month}-${day}`);
    return formatDate(date);
}

function formatTime(timeStr) {
    if (!timeStr || timeStr === 'F') return '';
    
    try {
        // Convert 24-hour format to 12-hour with AM/PM
        const [hours, minutes] = timeStr.split(':');
        const hour = parseInt(hours);
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${minutes} ${period}`;
    } catch (error) {
        console.error('Error formatting time:', error);
        return timeStr;
    }
}

// Modal manipulation helpers
function showModal(modalId) {
    const modalElement = document.getElementById(modalId);
    if (modalElement) {
        const modalInstance = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement);
        modalInstance.show();
    }
}

function hideModal(modalId) {
    const modalElement = document.getElementById(modalId);
    if (modalElement) {
        const modalInstance = bootstrap.Modal.getInstance(modalElement);
        if (modalInstance) {
            modalInstance.hide();
        }
    }
}

// Create alert notifications
function createAlert(message, type = 'info', duration = 5000) {
    // Create alert container if it doesn't exist
    let alertContainer = document.getElementById('alert-container');
    if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.id = 'alert-container';
        alertContainer.style.position = 'fixed';
        alertContainer.style.top = '20px';
        alertContainer.style.right = '20px';
        alertContainer.style.zIndex = '9999';
        alertContainer.style.maxWidth = '350px';
        alertContainer.style.width = '100%';
        document.body.appendChild(alertContainer);
    }
    
    // Create the alert element
    const alertElement = document.createElement('div');
    alertElement.className = `alert alert-${type} alert-dismissible fade show`;
    alertElement.role = 'alert';
    alertElement.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    // Add alert to container
    alertContainer.appendChild(alertElement);
    
    // Auto-dismiss after duration
    setTimeout(() => {
        alertElement.classList.remove('show');
        setTimeout(() => {
            alertContainer.removeChild(alertElement);
        }, 300); // Wait for fade animation
    }, duration);
    
    return alertElement;
}

// Form data handling
function getFormData(formId) {
    const form = document.getElementById(formId);
    if (!form) return null;
    
    const formData = {};
    const elements = form.elements;
    
    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        
        // Skip elements without name
        if (!element.name) continue;
        
        // Handle different input types
        if (element.type === 'checkbox') {
            formData[element.name] = element.checked;
        } else if (element.type === 'radio') {
            if (element.checked) {
                formData[element.name] = element.value;
            }
        } else if (element.type !== 'submit' && element.type !== 'button') {
            formData[element.name] = element.value;
        }
    }
    
    return formData;
}

function setFormData(formId, data) {
    const form = document.getElementById(formId);
    if (!form || !data) return;
    
    const elements = form.elements;
    
    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        
        // Skip elements without name
        if (!element.name || !(element.name in data)) continue;
        
        // Handle different input types
        if (element.type === 'checkbox') {
            element.checked = Boolean(data[element.name]);
        } else if (element.type === 'radio') {
            element.checked = (element.value === data[element.name]);
        } else if (element.type !== 'submit' && element.type !== 'button') {
            element.value = data[element.name] || '';
        }
    }
}

// Task-specific utilities
function getPriorityBadgeClass(priority) {
    switch (priority.toLowerCase()) {
        case 'high':
            return 'high-priority';
        case 'medium':
            return 'medium-priority';
        case 'low':
            return 'low-priority';
        default:
            return '';
    }
}

function getTagBadgeClass(tag) {
    switch (tag.toLowerCase()) {
        case 'study':
            return 'study';
        case 'work':
            return 'work';
        case 'read':
            return 'read';
        default:
            return 'other';
    }
}

// Date conversion utilities for API interactions
function convertDateForApi(dateStr) {
    if (!dateStr) return 'F';
    
    try {
        // Convert from input date format (YYYY-MM-DD) to API format (DD/MM/YYYY)
        const date = new Date(dateStr);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (error) {
        console.error('Error converting date for API:', error);
        return 'F';
    }
}

function convertDateFromApi(dateStr) {
    if (!dateStr || dateStr === 'F') return '';
    
    try {
        // Convert from API format (DD/MM/YYYY) to input date format (YYYY-MM-DD)
        const [day, month, year] = dateStr.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } catch (error) {
        console.error('Error converting date from API:', error);
        return '';
    }
}

// Theme toggle functionality
function initThemeToggle() {
    const themeToggleBtn = document.getElementById('themeToggle');
    if (!themeToggleBtn) return;
    
    // Check user preference
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    
    // Set initial theme
    document.body.classList.toggle('light-theme', !isDarkMode);
    
    // Update button icon
    const icon = themeToggleBtn.querySelector('i');
    if (icon) {
        icon.setAttribute('data-feather', isDarkMode ? 'moon' : 'sun');
        feather.replace();
    }
    
    // Add event listener
    themeToggleBtn.addEventListener('click', () => {
        // Toggle theme
        const currentIsDark = document.body.classList.toggle('light-theme');
        
        // Update localStorage
        localStorage.setItem('darkMode', (!currentIsDark).toString());
        
        // Update button icon
        const icon = themeToggleBtn.querySelector('i');
        if (icon) {
            icon.setAttribute('data-feather', currentIsDark ? 'sun' : 'moon');
            feather.replace();
        }
    });
}

// Check if string is a valid date
function isValidDate(dateStr) {
    // Check if string is in DD/MM/YYYY format
    const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    if (!dateRegex.test(dateStr)) return false;
    
    const [, day, month, year] = dateStr.match(dateRegex);
    const date = new Date(`${year}-${month}-${day}`);
    
    // Check if the date is valid
    return date instanceof Date && !isNaN(date) && 
           date.getDate() === parseInt(day) && 
           date.getMonth() + 1 === parseInt(month) && 
           date.getFullYear() === parseInt(year);
}

// Check if string is a valid time
function isValidTime(timeStr) {
    // Check if string is in HH:MM format (24-hour)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    return timeRegex.test(timeStr);
}

// Format task duration
function formatTaskDuration(hours) {
    if (!hours || hours === 'F') return '';
    
    const numHours = parseFloat(hours);
    if (isNaN(numHours)) return '';
    
    // Format with appropriate units
    if (numHours < 1) {
        return `${Math.round(numHours * 60)} min`;
    } else if (Number.isInteger(numHours)) {
        return `${numHours} h`;
    } else {
        return `${numHours} h`;
    }
}

// Calculate time between dates
function getTimeBetween(startDate, endDate) {
    if (!startDate || !endDate) return '';
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const diffMs = Math.abs(end - start);
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays < 1) {
        return 'Today';
    } else if (diffDays === 1) {
        return 'Tomorrow';
    } else if (diffDays < 7) {
        return `${diffDays} days`;
    } else if (diffDays < 30) {
        return `${Math.floor(diffDays / 7)} weeks`;
    } else {
        return `${Math.floor(diffDays / 30)} months`;
    }
}

// Export all utility functions
window.Utils = {
    // Date & time formatting
    formatDate,
    formatDateString,
    formatTime,
    
    // Modal helpers
    showModal,
    hideModal,
    
    // Notification helpers
    createAlert,
    
    // Form helpers
    getFormData,
    setFormData,
    
    // Task UI helpers
    getPriorityBadgeClass,
    getTagBadgeClass,
    
    // Date conversion
    convertDateForApi,
    convertDateFromApi,
    
    // Theme
    initThemeToggle,
    
    // Validation
    isValidDate,
    isValidTime,
    
    // Task formatting
    formatTaskDuration,
    getTimeBetween
};

// Initialize theme toggle on load
document.addEventListener('DOMContentLoaded', initThemeToggle);
