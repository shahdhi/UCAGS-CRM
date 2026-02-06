// Receipt Generation Page
let paymentCounter = 1;

// Toast notification function
function showToast(message, type = 'info') {
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  // Set icon based on type
  let icon = 'fa-info-circle';
  if (type === 'error') icon = 'fa-exclamation-circle';
  if (type === 'success') icon = 'fa-check-circle';
  if (type === 'warning') icon = 'fa-exclamation-triangle';
  
  toast.innerHTML = `
    <i class="fas ${icon}"></i>
    <span>${message}</span>
  `;
  
  // Add to page
  document.body.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Remove after 4 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function initReceiptsPage() {
  console.log('Initializing Receipts Page...');
  
  // Set default date to today
  document.getElementById('receiptDate').valueAsDate = new Date();
  
  // Add event listeners
  document.getElementById('addPaymentBtn').addEventListener('click', addPaymentRow);
  document.getElementById('generateReceiptBtn').addEventListener('click', generateReceipt);
  document.getElementById('clearFormBtn').addEventListener('click', clearReceiptForm);
}

// Removed auto-generation - users will type receipt number manually

function addPaymentRow() {
  const container = document.getElementById('paymentsContainer');
  paymentCounter++;
  
  const row = document.createElement('div');
  row.className = 'payment-row';
  row.dataset.rowId = paymentCounter;
  
  row.innerHTML = `
    <div class="payment-row-number">${paymentCounter}</div>
    <div class="payment-row-content">
      <div class="form-row">
        <div class="form-group">
          <label>Date of Payment *</label>
          <input type="date" class="form-control payment-date" required>
        </div>
        <div class="form-group">
          <label>Description *</label>
          <select class="form-control payment-description" required>
            <option value="">Select description</option>
            <option value="1st installment">1st installment</option>
            <option value="2nd installment">2nd installment</option>
            <option value="3rd installment">3rd installment</option>
            <option value="Full payment (course fee)">Full payment (course fee)</option>
            <option value="Registration fee">Registration fee</option>
            <option value="Graduation fee">Graduation fee</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Paid By *</label>
          <select class="form-control payment-paidby" required>
            <option value="">Select payment method</option>
            <option value="Online transfer">Online transfer</option>
            <option value="Bank deposit">Bank deposit</option>
            <option value="Card payment">Card payment</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label>Amount (LKR) *</label>
          <input type="number" class="form-control payment-amount" placeholder="8000" min="0" step="0.01" required>
        </div>
      </div>
    </div>
    <button type="button" class="btn-remove-payment" onclick="removePaymentRow(${paymentCounter})" title="Remove payment">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  container.appendChild(row);
  
  // Set default date to today
  row.querySelector('.payment-date').valueAsDate = new Date();
}

function removePaymentRow(rowId) {
  const row = document.querySelector(`[data-row-id="${rowId}"]`);
  if (row) {
    row.remove();
    renumberPaymentRows();
  }
}

function renumberPaymentRows() {
  const rows = document.querySelectorAll('.payment-row');
  rows.forEach((row, index) => {
    const numberDiv = row.querySelector('.payment-row-number');
    if (numberDiv) {
      numberDiv.textContent = index + 1;
    }
  });
}

function collectFormData() {
  // Collect basic information
  const receiptNumber = document.getElementById('receiptNumber').value.trim();
  const receiptDate = document.getElementById('receiptDate').value;
  const studentName = document.getElementById('studentName').value.trim();
  const studentIdInput = document.getElementById('studentId').value.trim();
  const studentId = 'UCAGS/' + studentIdInput; // Add UCAGS/ prefix
  const enrolledProgram = document.getElementById('enrolledProgram').value.trim();
  const paymentPlan = document.getElementById('paymentPlan').value.trim();
  
  // Validate basic fields
  if (!receiptNumber || !receiptDate || !studentName || !studentId || !enrolledProgram || !paymentPlan) {
    showToast('Please fill in all required fields', 'error');
    return null;
  }
  
  // Collect payments
  const payments = [];
  const paymentRows = document.querySelectorAll('.payment-row');
  
  if (paymentRows.length === 0) {
    showToast('Please add at least one payment', 'error');
    return null;
  }
  
  let isValid = true;
  paymentRows.forEach((row, index) => {
    const date = row.querySelector('.payment-date').value;
    const description = row.querySelector('.payment-description').value.trim();
    const paidBy = row.querySelector('.payment-paidby').value;
    const amount = row.querySelector('.payment-amount').value;
    
    if (!date || !description || !paidBy || !amount || amount <= 0) {
      showToast(`Payment ${index + 1}: Please fill in all fields`, 'error');
      isValid = false;
      return;
    }
    
    payments.push({
      date,
      description,
      paidBy,
      amount: parseFloat(amount)
    });
  });
  
  if (!isValid) {
    return null;
  }
  
  return {
    receiptNumber,
    receiptDate,
    studentName,
    studentId,
    enrolledProgram,
    paymentPlan,
    payments
  };
}

async function generateReceipt() {
  const data = collectFormData();
  if (!data) return;
  
  const btn = document.getElementById('generateReceiptBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
  btn.disabled = true;
  
  try {
    const token = await getAuthToken();
    const response = await fetch('/api/receipts/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error('Failed to generate receipt');
    }
    
    // Download the PDF
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${data.receiptNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    showToast('Receipt generated successfully!', 'success');
    
    // Ask if user wants to create another receipt
    if (confirm('Receipt generated successfully! Would you like to create another receipt?')) {
      clearReceiptForm();
    }
    
  } catch (error) {
    console.error('Error generating receipt:', error);
    showToast('Failed to generate receipt: ' + error.message, 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

function previewReceipt() {
  const data = collectFormData();
  if (!data) return;
  
  // Calculate total
  const total = data.payments.reduce((sum, payment) => sum + payment.amount, 0);
  
  // Create preview HTML
  let paymentsHTML = data.payments.map((payment, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${formatDate(payment.date)}</td>
      <td>${payment.description}</td>
      <td>${payment.paidBy}</td>
      <td>LKR ${payment.amount.toLocaleString()}</td>
    </tr>
  `).join('');
  
  const previewHTML = `
    <div style="font-family: Arial, sans-serif; max-width: 420pt; margin: 0 auto; border: 1px solid #ddd; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
      <div style="background: #5B2C6F; color: white; padding: 12px 30px 15px 30px; position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h1 style="margin: 0; font-size: 28px; font-weight: bold;">RECEIPT</h1>
          </div>
          <div>
            <img src="/logo.png" alt="UCAGS Logo" style="max-height: 45px; max-width: 100px; object-fit: contain;" onerror="this.src='/Picture1.svg'">
          </div>
        </div>
      </div>
      
      <div style="background: #5B2C6F; padding: 0; margin: 0;">
        <div style="background: #E8DFF5; padding: 15px 20px; margin: 0; border-top-right-radius: 15px; border-bottom-right-radius: 15px;">
        <p><strong>Receipt No:</strong> ${data.receiptNumber}</p>
        <p><strong>Receipt Date:</strong> ${formatDateLong(data.receiptDate)}</p>
        <p><strong>Student:</strong> ${data.studentName}</p>
        <p><strong>Student ID:</strong> ${data.studentId}</p>
        <p><strong>Enrolled program:</strong> ${data.enrolledProgram}</p>
        <p><strong>Payment plan:</strong> ${data.paymentPlan}</p>
      </div>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background: #5B2C6F; color: white;">
            <th style="padding: 10px; text-align: left;">No</th>
            <th style="padding: 10px; text-align: left;">Date</th>
            <th style="padding: 10px; text-align: left;">Description</th>
            <th style="padding: 10px; text-align: left;">Paid By</th>
            <th style="padding: 10px; text-align: left;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${paymentsHTML}
          <tr style="background: #E8DFF5; font-weight: bold;">
            <td colspan="4" style="padding: 10px; text-align: right;">Total:</td>
            <td style="padding: 10px;">LKR ${total.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>
      
      <p style="text-align: center; margin: 30px 0 15px 0;">Thank you for your payment</p>
      <div style="text-align: center; margin: 0 0 30px 30px;">
        <img src="/seal.png" alt="Seal" style="width: 80px; height: 80px;" onerror="this.style.display='none'">
      </div>
      
      <div style="background: #5B2C6F; padding: 0; margin-top: 40px;">
        <div style="background: #E8DFF5; padding: 12px 20px; text-align: center; border-top-right-radius: 15px; border-bottom-right-radius: 15px;">
          <p style="margin: 0; font-weight: bold; color: #000;">UNIVERSAL COLLEGE OF APPLIED & GENERAL STUDIES</p>
        </div>
      </div>
      
      <div style="background: #5B2C6F; color: white; padding: 15px 20px; text-align: center; border-bottom-left-radius: 15px;">
        <p style="font-size: 11px; margin: 5px 0;"><strong>Corporate Office:</strong> 190 A Anagarika Dharmapala Mawatha (Allen Avenue), Dehiwala, Sri Lanka</p>
        <p style="font-size: 11px; margin: 5px 0;"><strong>Hotline:</strong> +94 76 331 3333 | <strong>Email:</strong> study@ucags.com | <strong>Website:</strong> https://ucags.edu.lk/</p>
      </div>
    </div>
  `;
  
  // Show preview in modal
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'block';
  modal.innerHTML = `
    <div class="modal-content large">
      <div class="modal-header">
        <h2><i class="fas fa-eye"></i> Receipt Preview</h2>
        <button class="close-btn" onclick="this.closest('.modal').remove()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body">
        ${previewHTML}
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
        <button class="btn btn-primary" onclick="this.closest('.modal').remove(); generateReceipt();">
          <i class="fas fa-download"></i> Generate PDF
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

function clearReceiptForm() {
  if (!confirm('Are you sure you want to clear the form? All data will be lost.')) {
    return;
  }
  
  // Clear basic fields
  document.getElementById('studentName').value = '';
  document.getElementById('studentId').value = '';
  document.getElementById('enrolledProgram').value = 'Diploma in Psychology';
  document.getElementById('paymentPlan').value = '';
  
  // Clear payments
  const container = document.getElementById('paymentsContainer');
  container.innerHTML = '';
  paymentCounter = 0;
  
  // Add one default payment row
  addPaymentRow();
  
  // Set date to today
  document.getElementById('receiptDate').valueAsDate = new Date();
  
  showToast('Form cleared', 'info');
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB');
}

function formatDateLong(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'long' });
  const year = date.getFullYear();
  
  const j = day % 10;
  const k = day % 100;
  let suffix = 'th';
  if (j === 1 && k !== 11) suffix = 'st';
  if (j === 2 && k !== 12) suffix = 'nd';
  if (j === 3 && k !== 13) suffix = 'rd';
  
  return `${day}${suffix} of ${month} ${year}`;
}

async function getAuthToken() {
  // Get token from Supabase session
  try {
    const session = await window.SupabaseAuth.getSession();
    if (session && session.access_token) {
      return session.access_token;
    }
    console.error('No valid session found');
    return '';
  } catch (error) {
    console.error('Error getting auth token:', error);
    return '';
  }
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReceiptsPage);
} else {
  initReceiptsPage();
}
