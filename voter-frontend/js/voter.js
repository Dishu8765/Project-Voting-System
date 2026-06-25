/**
 * Secure Vote — Voter Frontend
 * Step-by-step voting flow with accessibility support.
 */

(function () {
  'use strict';

  const API_BASE = 'http://localhost:3000';

  const TOTAL_STEPS = 5;

  const STEP_TITLES = {
    1: 'Welcome',
    2: 'Identity Verification',
    3: 'Candidate Selection',
    4: 'Confirmation',
    5: 'Receipt'
  };

  const state = {
    currentStep: 1,
    voterId: '',
    fullName: '',
    dateOfBirth: '',
    selectedCandidateId: null,
    token: null,
    receiptData: null,
    candidates: null
  };

  const elements = {
    currentStep: document.getElementById('current-step'),
    totalSteps: document.getElementById('total-steps'),
    progressBar: document.getElementById('progress-bar'),
    progressBarFill: document.getElementById('progress-bar-fill'),
    progressSteps: document.getElementById('progress-steps'),
    srAnnouncements: document.getElementById('sr-announcements'),
    identityForm: document.getElementById('identity-form'),
    candidateList: document.getElementById('candidate-list'),
    confirmName: document.getElementById('confirm-name'),
    confirmCandidate: document.getElementById('confirm-candidate'),
    confirmOffice: document.getElementById('confirm-office'),
    confirmCheckbox: document.getElementById('confirm-checkbox'),
    receiptCode: document.getElementById('receipt-code'),
    receiptTime: document.getElementById('receipt-time'),
    receiptBlock: document.getElementById('receipt-block'),
    authError: document.getElementById('auth-api-error'),
    candidatesError: document.getElementById('candidates-api-error'),
    voteError: document.getElementById('vote-api-error')
  };

  function announce(message) {
    if (elements.srAnnouncements) {
      elements.srAnnouncements.textContent = '';
      requestAnimationFrame(function () {
        elements.srAnnouncements.textContent = message;
      });
    }
  }

  function setLoading(buttonEl, isLoading, loadingText, originalText) {
    if (isLoading) {
      buttonEl.disabled = true;
      buttonEl.textContent = loadingText || 'Please wait\u2026';
    } else {
      buttonEl.disabled = false;
      buttonEl.textContent = originalText;
    }
  }

  function showInlineError(containerEl, message) {
    containerEl.textContent = message;
    containerEl.hidden = false;
    containerEl.focus();
    announce(message);
  }

  function clearInlineError(containerEl) {
    containerEl.textContent = '';
    containerEl.hidden = true;
  }

  // --- API helpers ---

  async function apiLogin(voterId, fullName, dateOfBirth) {
    var res = await fetch(API_BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voterId: voterId, fullName: fullName, dateOfBirth: dateOfBirth })
    });
    var json = await res.json();
    if (!res.ok) throw json;
    return json.data; // { token, voterId, expiresIn }
  }

  async function apiFetchCandidates() {
    var res = await fetch(API_BASE + '/api/votes/candidates');
    var json = await res.json();
    if (!res.ok) throw json;
    return json.data.candidates; // [{ id, name, party, office }]
  }

  async function apiSubmitVote(token, candidateId) {
    var res = await fetch(API_BASE + '/api/votes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ candidateId: candidateId })
    });
    var json = await res.json();
    if (!res.ok) throw json;
    return json.data; // { confirmationCode, txHash, timestamp, ... }
  }

  // --- Utilities ---

  function truncateTxHash(txHash) {
    var stripped = (txHash && txHash.startsWith('0x')) ? txHash.slice(2) : (txHash || '');
    var head = stripped.slice(0, 6);
    var tail = stripped.slice(-4);
    return '0x' + head + '\u2026' + tail;
  }

  function getStepElement(step) {
    return document.getElementById('step-' + step);
  }

  function updateProgress(step) {
    elements.currentStep.textContent = step;
    elements.totalSteps.textContent = TOTAL_STEPS;

    var percent = (step / TOTAL_STEPS) * 100;
    elements.progressBarFill.style.width = percent + '%';
    elements.progressBar.setAttribute('aria-valuenow', step);

    var stepItems = elements.progressSteps.querySelectorAll('.progress-step');
    stepItems.forEach(function (item) {
      var itemStep = parseInt(item.getAttribute('data-step'), 10);
      item.classList.remove('active', 'completed');
      if (itemStep === step) {
        item.classList.add('active');
      } else if (itemStep < step) {
        item.classList.add('completed');
      }
    });
  }

  function showStep(step) {
    document.querySelectorAll('.vote-step').forEach(function (section) {
      var sectionStep = parseInt(section.getAttribute('data-step'), 10);
      if (sectionStep === step) {
        section.classList.add('active');
        section.removeAttribute('hidden');
      } else {
        section.classList.remove('active');
        section.setAttribute('hidden', '');
      }
    });

    state.currentStep = step;
    updateProgress(step);
    announce('Step ' + step + ' of ' + TOTAL_STEPS + ': ' + STEP_TITLES[step]);

    var stepEl = getStepElement(step);
    if (stepEl) {
      var heading = stepEl.querySelector('.step-heading');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    }

    if (step === 3) {
      enterStep3();
    }
  }

  function validateIdentityForm() {
    var valid = true;

    var voterId = document.getElementById('voter-id');
    var fullName = document.getElementById('full-name');
    var dob = document.getElementById('date-of-birth');

    [voterId, fullName, dob].forEach(function (field) {
      field.classList.remove('is-invalid');
    });

    if (!voterId.value.trim() || !/^[A-Za-z0-9]{6,12}$/.test(voterId.value.trim())) {
      voterId.classList.add('is-invalid');
      document.getElementById('voter-id-error').textContent =
        'Please enter a valid voter ID (6 to 12 letters or numbers).';
      valid = false;
    }

    if (!fullName.value.trim() || fullName.value.trim().length < 2) {
      fullName.classList.add('is-invalid');
      document.getElementById('full-name-error').textContent =
        'Please enter your full legal name.';
      valid = false;
    }

    if (!dob.value) {
      dob.classList.add('is-invalid');
      document.getElementById('dob-error').textContent =
        'Please enter your date of birth.';
      valid = false;
    }

    if (valid) {
      state.voterId = voterId.value.trim();
      state.fullName = fullName.value.trim();
      state.dateOfBirth = dob.value;
    }

    return valid;
  }

  function getSelectedCandidate() {
    if (!state.candidates) return null;
    return state.candidates.find(function (c) {
      return c.id === state.selectedCandidateId;
    });
  }

  function renderCandidates(candidates) {
    elements.candidateList.innerHTML = candidates.map(function (candidate) {
      var initials = candidate.name.split(' ')
        .map(function (w) { return w[0]; })
        .join('')
        .slice(0, 2)
        .toUpperCase();
      var checked = state.selectedCandidateId === candidate.id ? ' checked' : '';
      return (
        '<label class="candidate-card" for="candidate-' + candidate.id + '">' +
          '<input type="radio" name="candidate" id="candidate-' + candidate.id + '"' +
            ' value="' + candidate.id + '"' + checked +
            ' aria-describedby="candidate-desc-' + candidate.id + '">' +
          '<div class="candidate-card-inner">' +
            '<div class="candidate-avatar" aria-hidden="true">' + initials + '</div>' +
            '<div class="candidate-info">' +
              '<p class="candidate-name">' + candidate.name + '</p>' +
              '<p class="candidate-party" id="candidate-desc-' + candidate.id + '">' +
                candidate.party + ' &mdash; ' + candidate.office +
              '</p>' +
            '</div>' +
            '<div class="candidate-check" aria-hidden="true"></div>' +
          '</div>' +
        '</label>'
      );
    }).join('');

    elements.candidateList.querySelectorAll('input[type="radio"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        state.selectedCandidateId = radio.value;
        document.getElementById('candidate-error').hidden = true;
      });
    });
  }

  async function enterStep3() {
    var btn = document.getElementById('btn-select-candidate');
    btn.disabled = true;
    elements.candidateList.innerHTML = '<p class="candidates-loading" aria-live="polite">Loading candidates\u2026</p>';
    clearInlineError(elements.candidatesError);

    try {
      var candidates = await apiFetchCandidates();
      state.candidates = candidates;
      renderCandidates(candidates);
      btn.disabled = false;
    } catch (err) {
      var msg = (err && err.message) ? err.message : 'A network error occurred. Please check your connection and try again.';
      showInlineError(elements.candidatesError, msg);
      // Back button stays enabled — no additional action needed
    }
  }

  function populateConfirmation() {
    var candidate = getSelectedCandidate();
    elements.confirmName.textContent = state.fullName;
    elements.confirmCandidate.textContent = candidate ? candidate.name : '—';
    elements.confirmOffice.textContent = candidate ? candidate.office : '—';
    elements.confirmCheckbox.checked = false;
    document.getElementById('confirm-error').hidden = true;
  }

  function populateReceipt() {
    var data = state.receiptData;
    elements.receiptCode.textContent = data.confirmationCode;
    elements.receiptTime.textContent = formatTimestamp(new Date(data.timestamp));
    elements.receiptBlock.textContent = truncateTxHash(data.txHash);

    // Show full tx hash section if we have a real hash
    var txSection = document.getElementById('receipt-tx-section');
    var txHashEl = document.getElementById('receipt-tx-hash');
    var copyBtn = document.getElementById('btn-copy-tx');

    if (data.txHash && txSection && txHashEl) {
      txHashEl.textContent = data.txHash;
      txSection.removeAttribute('hidden');

      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(data.txHash).then(function () {
              copyBtn.textContent = '✓ Copied!';
              setTimeout(function () { copyBtn.textContent = 'Copy'; }, 2000);
            }).catch(function () {
              copyBtn.textContent = 'Copy failed';
            });
          } else {
            // Fallback for non-secure contexts
            var range = document.createRange();
            range.selectNode(txHashEl);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            try {
              document.execCommand('copy');
              copyBtn.textContent = '✓ Copied!';
            } catch (err) {
              copyBtn.textContent = 'Select & copy manually';
            }
            window.getSelection().removeAllRanges();
            setTimeout(function () { copyBtn.textContent = 'Copy'; }, 2000);
          }
        });
      }
    }
  }

  function formatTimestamp(date) {
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  function handleNext(step) {
    if (step === 4) {
      populateConfirmation();
    }
    if (step === 5) {
      populateReceipt();
    }
    showStep(step);
  }

  function bindEvents() {
    document.getElementById('btn-start').addEventListener('click', function () {
      handleNext(2);
    });

    elements.identityForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      clearInlineError(elements.authError);
      if (!validateIdentityForm()) {
        announce('Please correct the errors in the form before continuing.');
        var firstInvalid = elements.identityForm.querySelector('.is-invalid');
        if (firstInvalid) firstInvalid.focus();
        return;
      }
      var btn = document.getElementById('btn-verify');
      setLoading(btn, true, 'Please wait\u2026', 'Continue to Candidates');
      try {
        var data = await apiLogin(state.voterId, state.fullName, state.dateOfBirth);
        state.token = data.token;
        handleNext(3);
      } catch (err) {
        var msg = (err && err.message) ? err.message : 'A network error occurred. Please check your connection and try again.';
        showInlineError(elements.authError, msg);
      } finally {
        setLoading(btn, false, null, 'Continue to Candidates');
      }
    });

    document.getElementById('btn-select-candidate').addEventListener('click', function () {
      if (!state.selectedCandidateId) {
        document.getElementById('candidate-error').hidden = false;
        announce('Please select a candidate before continuing.');
        var firstRadio = elements.candidateList.querySelector('input[type="radio"]');
        if (firstRadio) firstRadio.focus();
        return;
      }
      handleNext(4);
    });

    document.getElementById('btn-submit-vote').addEventListener('click', async function () {
      if (!elements.confirmCheckbox.checked) {
        document.getElementById('confirm-error').hidden = false;
        announce('Please check the confirmation box to submit your vote.');
        elements.confirmCheckbox.focus();
        return;
      }
      clearInlineError(elements.voteError);
      var submitBtn = document.getElementById('btn-submit-vote');
      var backBtn = document.querySelector('#step-4 .btn-back');
      setLoading(submitBtn, true, 'Please wait\u2026', 'Submit My Vote');
      backBtn.disabled = true;
      try {
        var data = await apiSubmitVote(state.token, state.selectedCandidateId);
        state.receiptData = data;
        handleNext(5);
      } catch (err) {
        var msg = (err && err.message) ? err.message : 'A network error occurred. Please check your connection and try again.';
        showInlineError(elements.voteError, msg);
      } finally {
        setLoading(submitBtn, false, null, 'Submit My Vote');
        backBtn.disabled = false;
      }
    });

    document.getElementById('btn-finish').addEventListener('click', function () {
      announce('Voting complete. Thank you for participating.');
      window.location.reload();
    });

    document.querySelectorAll('.btn-back').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var backStep = parseInt(btn.getAttribute('data-back'), 10);
        showStep(backStep);
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.currentStep > 1 && state.currentStep < 5) {
        var backBtn = getStepElement(state.currentStep).querySelector('.btn-back');
        if (backBtn) backBtn.click();
      }
    });
  }

  function init() {
    bindEvents();
    updateProgress(1);
    announce('Welcome to Secure Vote. Step 1 of 5.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
