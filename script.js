document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://127.0.0.1:5000/api'; // Your Flask backend URL

    // Search Elements
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const searchResultsDiv = document.getElementById('searchResults');
    const noResultsMessage = document.getElementById('noResultsMessage');

    // Add Subject Elements
    const addSubjectSection = document.getElementById('addSubjectSection');
    const newSubjectNameInput = document.getElementById('newSubjectName');
    const addSubjectButton = document.getElementById('addSubjectButton');
    const addSubjectStatus = document.getElementById('addSubjectStatus');

    // Selected Subject & Review Elements
    const selectedSubjectSection = document.getElementById('selectedSubjectSection');
    const selectedSubjectNameH2 = document.getElementById('selectedSubjectName');
    const averageRatingSpan = document.getElementById('averageRating');
    const reviewsListDiv = document.getElementById('reviewsList');
    const ratingSelect = document.getElementById('rating');
    const commentTextarea = document.getElementById('comment');
    const submitReviewButton = document.getElementById('submitReviewButton');
    const reviewStatus = document.getElementById('reviewStatus');

    let currentSelectedSubjectId = null;
    const secretAnswerInput = document.getElementById('secretAnswer');

    // --- Event Listeners ---
    searchButton.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });

    addSubjectButton.addEventListener('click', handleAddSubject);
    submitReviewButton.addEventListener('click', handleSubmitReview);

    // --- Functions ---

    async function handleSearch() {
        const query = searchInput.value.trim();
        clearSearchResults();
        selectedSubjectSection.style.display = 'none'; // Hide review section on new search
        currentSelectedSubjectId = null;

        if (!query) {
            // Optionally show a message or do nothing
            noResultsMessage.textContent = "Please enter a search term.";
            noResultsMessage.style.display = 'block';
            addSubjectSection.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/subjects?search=${encodeURIComponent(query)}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const subjects = await response.json();

            if (subjects.length > 0) {
                displaySearchResults(subjects);
                noResultsMessage.style.display = 'none';
                addSubjectSection.style.display = 'none'; // Hide add subject form if results found
            } else {
                noResultsMessage.textContent = `No subjects found matching "${query}". You can add it.`;
                noResultsMessage.style.display = 'block';
                addSubjectSection.style.display = 'block';
                newSubjectNameInput.value = query; // Pre-fill the add subject input
            }
        } catch (error) {
            console.error("Search error:", error);
            searchResultsDiv.innerHTML = `<p class="error">Error searching: ${error.message}</p>`;
            noResultsMessage.style.display = 'none';
            addSubjectSection.style.display = 'none';
        }
    }

    function displaySearchResults(subjects) {
        subjects.forEach(subject => {
            const subjectDiv = document.createElement('div');
            subjectDiv.classList.add('subject-item');
            subjectDiv.textContent = `${subject.name} (Avg Rating: ${subject.average_rating !== null ? subject.average_rating : 'N/A'})`;
            subjectDiv.dataset.id = subject.id;
            subjectDiv.dataset.name = subject.name; // Store name for display
            subjectDiv.dataset.avgRating = subject.average_rating;
            subjectDiv.addEventListener('click', () => selectSubject(subject.id, subject.name, subject.average_rating));
            searchResultsDiv.appendChild(subjectDiv);
        });
    }

    function clearSearchResults() {
        searchResultsDiv.innerHTML = '';
        noResultsMessage.style.display = 'none';
    }

    async function selectSubject(subjectId, subjectName, avgRating) {
        currentSelectedSubjectId = subjectId;
        selectedSubjectNameH2.textContent = `Reviews for: ${subjectName}`;
        averageRatingSpan.textContent = avgRating !== null ? avgRating : 'N/A';
        selectedSubjectSection.style.display = 'block';
        addSubjectSection.style.display = 'none'; // Hide add subject form
        clearSearchResults();
        searchInput.value = ''; // Clear search input
        await fetchAndDisplayReviews(subjectId);
    }

    async function handleAddSubject() {
        const name = newSubjectNameInput.value.trim();
        if (!name) {
            addSubjectStatus.textContent = "Subject name cannot be empty.";
            addSubjectStatus.className = 'error';
            return;
        }

        addSubjectStatus.textContent = "Adding...";
        addSubjectStatus.className = '';

        try {
            const response = await fetch(`${API_BASE_URL}/subjects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const result = await response.json();

            if (response.ok) {
                addSubjectStatus.textContent = `Subject "${result.name}" added!`;
                addSubjectStatus.className = 'success';
                newSubjectNameInput.value = ''; // Clear input
                addSubjectSection.style.display = 'none'; // Hide form
                selectSubject(result.id, result.name, result.average_rating); // Automatically select the new subject
            } else if (response.status === 409) { // Conflict - subject already exists
                addSubjectStatus.textContent = `Error: ${result.error}. Selecting existing subject.`;
                addSubjectStatus.className = 'error';
                selectSubject(result.subject.id, result.subject.name, result.subject.average_rating); // Select the one that already exists
            } else {
                addSubjectStatus.textContent = `Error: ${result.error || 'Failed to add subject'}`;
                addSubjectStatus.className = 'error';
            }
        } catch (error) {
            console.error("Add subject error:", error);
            addSubjectStatus.textContent = `Error: ${error.message}`;
            addSubjectStatus.className = 'error';
        }
    }

    async function fetchAndDisplayReviews(subjectId) {
        reviewsListDiv.innerHTML = '<p>Loading reviews...</p>';
        try {
            const response = await fetch(`${API_BASE_URL}/subjects/${subjectId}/reviews`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const reviews = await response.json();

            reviewsListDiv.innerHTML = ''; // Clear loading/previous reviews
            if (reviews.length > 0) {
                reviews.forEach(review => {
                    const reviewDiv = document.createElement('div');
                    reviewDiv.classList.add('review-item');
                    const ratingStars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
                    reviewDiv.innerHTML = `
                        <p class="rating">${ratingStars} (${review.rating}/5)</p>
                        <p>${review.comment ? escapeHTML(review.comment) : '<em>No comment</em>'}</p>
                        <small>Reviewed on: ${new Date(review.created_at).toLocaleDateString()}</small>
                    `;
                    reviewsListDiv.appendChild(reviewDiv);
                });
            } else {
                reviewsListDiv.innerHTML = '<p>No reviews yet for this subject. Be the first!</p>';
            }
        } catch (error) {
            console.error("Fetch reviews error:", error);
            reviewsListDiv.innerHTML = `<p class="error">Error loading reviews: ${error.message}</p>`;
        }
    }

    async function handleSubmitReview() {
        if (!currentSelectedSubjectId) {
            reviewStatus.textContent = "Please select a subject first.";
            reviewStatus.className = 'error';
            return;
        }

        const rating = parseInt(ratingSelect.value);
        const comment = commentTextarea.value.trim();
        const secretAnswer = secretAnswerInput.value.trim();

        if (isNaN(rating) || rating < 1 || rating > 5) {
            reviewStatus.textContent = "Invalid rating.";
            reviewStatus.className = 'error';
            return;
        }
        if (comment.length > 280) {
            reviewStatus.textContent = "Comment is too long (max 280 characters).";
            reviewStatus.className = 'error';
            return;
        }

        if (!secretAnswer) {
            reviewStatus.textContent = "Please answer the security question.";
            reviewStatus.className = 'error';
            return;
        }

        reviewStatus.textContent = "Submitting...";
        reviewStatus.className = '';

        try {
            const response = await fetch(`${API_BASE_URL}/subjects/${currentSelectedSubjectId}/reviews`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rating,
                    comment,
                    secret_answer: secretAnswer
                })
            });
            const result = await response.json();

            if (response.ok) {
                reviewStatus.textContent = "Review submitted successfully!";
                reviewStatus.className = 'success';
                commentTextarea.value = ''; // Clear comment field
                ratingSelect.value = "5"; // Reset rating
                await fetchAndDisplayReviews(currentSelectedSubjectId); // Refresh reviews
                // Also refresh average rating for the subject
                const subjectResponse = await fetch(`${API_BASE_URL}/subjects?search=${encodeURIComponent(selectedSubjectNameH2.textContent.replace('Reviews for: ',''))}`); // Bit hacky to get the single subject
                const subjects = await subjectResponse.json();
                if (subjects.length > 0 && subjects[0].id === currentSelectedSubjectId) {
                     averageRatingSpan.textContent = subjects[0].average_rating !== null ? subjects[0].average_rating : 'N/A';
                }

            } else {
                reviewStatus.textContent = `Error: ${result.error || 'Failed to submit review'}`;
                reviewStatus.className = 'error';
            }
        } catch (error) {
            console.error("Submit review error:", error);
            reviewStatus.textContent = `Error: ${error.message}`;
            reviewStatus.className = 'error';
        }
    }



    // Utility to prevent basic XSS from comments
    function escapeHTML(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

});