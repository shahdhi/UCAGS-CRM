/**
 * UCAGS CRM - Google Apps Script Automation
 * 
 * This script should be deployed in the Google Sheets Admin spreadsheet.
 * It provides automatic assignment, follow-up reminders, and data synchronization.
 * 
 * Setup Instructions:
 * 1. Open your Admin Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Copy and paste this entire script
 * 4. Save and authorize the script
 * 5. Set up time-driven triggers (Edit > Current project's triggers)
 */

// Configuration - Update these with your actual values
const CONFIG = {
  ADMIN_SHEET_NAME: 'Admin',
  OFFICERS_SHEET_NAME: 'Officers',
  WEBHOOK_URL: 'https://your-crm-server.com/api/enquiries', // Your CRM API endpoint
  EMAIL_FROM: 'admissions@ucags.edu.lk',
  CALENDAR_ID: 'primary'
};

/**
 * Create menu when spreadsheet opens
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('UCAGS CRM')
    .addItem('Auto-assign New Enquiries', 'autoAssignNewEnquiries')
    .addItem('Send Follow-up Reminders', 'sendFollowUpReminders')
    .addItem('Sync Officer Sheets', 'syncOfficerSheets')
    .addItem('Generate Report', 'generateReport')
    .addToUi();
}

/**
 * Automatically assign new enquiries to officers (round-robin)
 * Run this as a time-driven trigger (e.g., every 10 minutes)
 */
function autoAssignNewEnquiries() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const adminSheet = ss.getSheetByName(CONFIG.ADMIN_SHEET_NAME);
  const officersSheet = ss.getSheetByName(CONFIG.OFFICERS_SHEET_NAME);
  
  if (!adminSheet || !officersSheet) {
    Logger.log('Required sheets not found');
    return;
  }
  
  // Get all enquiries
  const adminData = adminSheet.getDataRange().getValues();
  const headers = adminData[0];
  const assignedOfficerCol = headers.indexOf('Assigned Officer');
  const statusCol = headers.indexOf('Status');
  
  if (assignedOfficerCol === -1 || statusCol === -1) {
    Logger.log('Required columns not found');
    return;
  }
  
  // Get list of officers
  const officersData = officersSheet.getDataRange().getValues();
  const officers = [];
  for (let i = 1; i < officersData.length; i++) {
    if (officersData[i][0]) { // If username exists
      officers.push({
        username: officersData[i][0],
        name: officersData[i][2],
        sheetId: officersData[i][4]
      });
    }
  }
  
  if (officers.length === 0) {
    Logger.log('No officers found');
    return;
  }
  
  let officerIndex = 0;
  let assignedCount = 0;
  
  // Process unassigned enquiries
  for (let i = 1; i < adminData.length; i++) {
    const row = adminData[i];
    const assignedOfficer = row[assignedOfficerCol];
    
    // If not assigned, assign to next officer
    if (!assignedOfficer || assignedOfficer === '') {
      const officer = officers[officerIndex % officers.length];
      
      // Update admin sheet
      adminSheet.getRange(i + 1, assignedOfficerCol + 1).setValue(officer.username);
      
      // Copy to officer's sheet if sheetId exists
      if (officer.sheetId) {
        try {
          copyToOfficerSheet(officer.sheetId, row);
        } catch (error) {
          Logger.log('Error copying to officer sheet: ' + error);
        }
      }
      
      assignedCount++;
      officerIndex++;
    }
  }
  
  Logger.log('Assigned ' + assignedCount + ' new enquiries');
}

/**
 * Copy enquiry to officer's sheet
 */
function copyToOfficerSheet(sheetId, enquiryRow) {
  try {
    const officerSheet = SpreadsheetApp.openById(sheetId).getSheets()[0];
    officerSheet.appendRow(enquiryRow);
  } catch (error) {
    Logger.log('Error accessing officer sheet: ' + error);
  }
}

/**
 * Send follow-up reminders for upcoming dates
 * Run this daily as a time-driven trigger
 */
function sendFollowUpReminders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const adminSheet = ss.getSheetByName(CONFIG.ADMIN_SHEET_NAME);
  
  if (!adminSheet) {
    Logger.log('Admin sheet not found');
    return;
  }
  
  const data = adminSheet.getDataRange().getValues();
  const headers = data[0];
  
  const nameCol = headers.indexOf('Full Name');
  const emailCol = headers.indexOf('Email');
  const followUpCol = headers.indexOf('Follow-up Date');
  const assignedOfficerCol = headers.indexOf('Assigned Officer');
  const statusCol = headers.indexOf('Status');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  let reminderCount = 0;
  
  // Check each enquiry
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const followUpDate = row[followUpCol];
    
    if (!followUpDate) continue;
    
    const followUpDateTime = new Date(followUpDate);
    followUpDateTime.setHours(0, 0, 0, 0);
    
    // Send reminder if follow-up is tomorrow
    if (followUpDateTime.getTime() === tomorrow.getTime()) {
      const name = row[nameCol];
      const email = row[emailCol];
      const officer = row[assignedOfficerCol];
      const status = row[statusCol];
      
      sendReminderEmail(officer, name, email, followUpDate, status);
      reminderCount++;
    }
  }
  
  Logger.log('Sent ' + reminderCount + ' follow-up reminders');
}

/**
 * Send reminder email to officer
 */
function sendReminderEmail(officerUsername, studentName, studentEmail, followUpDate, status) {
  try {
    const subject = 'UCAGS CRM - Follow-up Reminder: ' + studentName;
    const body = `
      Hello,
      
      This is a reminder that you have a follow-up scheduled for tomorrow:
      
      Student Name: ${studentName}
      Email: ${studentEmail}
      Follow-up Date: ${Utilities.formatDate(new Date(followUpDate), Session.getScriptTimeZone(), 'yyyy-MM-dd')}
      Current Status: ${status}
      
      Please log into the UCAGS CRM to view full details and take appropriate action.
      
      Best regards,
      UCAGS CRM System
    `;
    
    // Get officer email from Officers sheet
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const officersSheet = ss.getSheetByName(CONFIG.OFFICERS_SHEET_NAME);
    const officersData = officersSheet.getDataRange().getValues();
    
    let officerEmail = null;
    for (let i = 1; i < officersData.length; i++) {
      if (officersData[i][0] === officerUsername) {
        officerEmail = officersData[i][3]; // Email column
        break;
      }
    }
    
    if (officerEmail) {
      MailApp.sendEmail(officerEmail, subject, body);
    }
  } catch (error) {
    Logger.log('Error sending reminder email: ' + error);
  }
}

/**
 * Sync data from Admin sheet to Officer sheets
 */
function syncOfficerSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const adminSheet = ss.getSheetByName(CONFIG.ADMIN_SHEET_NAME);
  const officersSheet = ss.getSheetByName(CONFIG.OFFICERS_SHEET_NAME);
  
  if (!adminSheet || !officersSheet) {
    Logger.log('Required sheets not found');
    return;
  }
  
  const adminData = adminSheet.getDataRange().getValues();
  const headers = adminData[0];
  const assignedOfficerCol = headers.indexOf('Assigned Officer');
  
  // Get officers with their sheet IDs
  const officersData = officersSheet.getDataRange().getValues();
  const officerSheets = {};
  
  for (let i = 1; i < officersData.length; i++) {
    if (officersData[i][0] && officersData[i][4]) {
      officerSheets[officersData[i][0]] = officersData[i][4];
    }
  }
  
  // Group enquiries by officer
  const enquiriesByOfficer = {};
  
  for (let i = 1; i < adminData.length; i++) {
    const row = adminData[i];
    const officer = row[assignedOfficerCol];
    
    if (officer && officerSheets[officer]) {
      if (!enquiriesByOfficer[officer]) {
        enquiriesByOfficer[officer] = [];
      }
      enquiriesByOfficer[officer].push(row);
    }
  }
  
  // Update each officer's sheet
  for (const officer in enquiriesByOfficer) {
    const sheetId = officerSheets[officer];
    try {
      const officerSpreadsheet = SpreadsheetApp.openById(sheetId);
      const officerSheet = officerSpreadsheet.getSheets()[0];
      
      // Clear existing data (except header)
      if (officerSheet.getLastRow() > 1) {
        officerSheet.deleteRows(2, officerSheet.getLastRow() - 1);
      }
      
      // Add header if not exists
      if (officerSheet.getLastRow() === 0) {
        officerSheet.appendRow(headers);
      }
      
      // Add all enquiries for this officer
      enquiriesByOfficer[officer].forEach(row => {
        officerSheet.appendRow(row);
      });
      
      Logger.log('Synced ' + enquiriesByOfficer[officer].length + ' enquiries to ' + officer);
    } catch (error) {
      Logger.log('Error syncing to officer ' + officer + ': ' + error);
    }
  }
}

/**
 * Generate and email weekly report
 */
function generateReport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const adminSheet = ss.getSheetByName(CONFIG.ADMIN_SHEET_NAME);
  
  if (!adminSheet) {
    Logger.log('Admin sheet not found');
    return;
  }
  
  const data = adminSheet.getDataRange().getValues();
  const headers = data[0];
  
  const statusCol = headers.indexOf('Status');
  const assignedOfficerCol = headers.indexOf('Assigned Officer');
  const createdDateCol = headers.indexOf('Created Date');
  
  // Calculate statistics
  const stats = {
    total: data.length - 1,
    new: 0,
    contacted: 0,
    followUp: 0,
    registered: 0,
    closed: 0,
    thisWeek: 0
  };
  
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  const officerStats = {};
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = row[statusCol];
    const officer = row[assignedOfficerCol];
    const createdDate = new Date(row[createdDateCol]);
    
    // Count by status
    switch(status) {
      case 'New': stats.new++; break;
      case 'Contacted': stats.contacted++; break;
      case 'Follow-up': stats.followUp++; break;
      case 'Registered': stats.registered++; break;
      case 'Closed': stats.closed++; break;
    }
    
    // Count this week's enquiries
    if (createdDate >= oneWeekAgo) {
      stats.thisWeek++;
    }
    
    // Count by officer
    if (officer) {
      if (!officerStats[officer]) {
        officerStats[officer] = 0;
      }
      officerStats[officer]++;
    }
  }
  
  // Generate report
  let report = 'UCAGS CRM Weekly Report\n';
  report += '======================\n\n';
  report += 'Overall Statistics:\n';
  report += '- Total Enquiries: ' + stats.total + '\n';
  report += '- New: ' + stats.new + '\n';
  report += '- Contacted: ' + stats.contacted + '\n';
  report += '- Follow-up: ' + stats.followUp + '\n';
  report += '- Registered: ' + stats.registered + '\n';
  report += '- Closed: ' + stats.closed + '\n';
  report += '- Enquiries This Week: ' + stats.thisWeek + '\n\n';
  
  report += 'Enquiries by Officer:\n';
  for (const officer in officerStats) {
    report += '- ' + officer + ': ' + officerStats[officer] + '\n';
  }
  
  Logger.log(report);
  
  // Send report email (configure recipient)
  try {
    MailApp.sendEmail(
      CONFIG.EMAIL_FROM,
      'UCAGS CRM - Weekly Report',
      report
    );
  } catch (error) {
    Logger.log('Error sending report: ' + error);
  }
  
  return report;
}

/**
 * Webhook handler for external form submissions
 * Configure this as a web app (Deploy > New deployment > Web app)
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const adminSheet = ss.getSheetByName(CONFIG.ADMIN_SHEET_NAME);
    
    if (!adminSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Admin sheet not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Generate enquiry ID
    const enquiryId = Utilities.getUuid().substring(0, 8);
    const createdDate = new Date().toISOString();
    
    // Append new enquiry
    const newRow = [
      enquiryId,
      data.fullName || '',
      data.phone || '',
      data.email || '',
      data.course || '',
      data.source || 'External Form',
      '', // Assigned Officer (will be auto-assigned)
      'New',
      '', // Follow-up Date
      data.notes || '',
      createdDate
    ];
    
    adminSheet.appendRow(newRow);
    
    // Trigger auto-assignment
    autoAssignNewEnquiries();
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      enquiryId: enquiryId
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('Error in doPost: ' + error);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Setup time-driven triggers
 * Run this once manually to set up automatic triggers
 */
function setupTriggers() {
  // Delete existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
  
  // Auto-assign new enquiries every 10 minutes
  ScriptApp.newTrigger('autoAssignNewEnquiries')
    .timeBased()
    .everyMinutes(10)
    .create();
  
  // Send follow-up reminders daily at 9 AM
  ScriptApp.newTrigger('sendFollowUpReminders')
    .timeBased()
    .atHour(9)
    .everyDays(1)
    .create();
  
  // Sync officer sheets every hour
  ScriptApp.newTrigger('syncOfficerSheets')
    .timeBased()
    .everyHours(1)
    .create();
  
  // Generate weekly report every Monday at 8 AM
  ScriptApp.newTrigger('generateReport')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();
  
  Logger.log('Triggers set up successfully');
}
