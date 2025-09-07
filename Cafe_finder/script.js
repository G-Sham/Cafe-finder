// ------------------- Configuration -------------------
const UNSPLASH_ACCESS_KEY = "w0KWKXjLboF_KVEKKihzbRVxYr-ORMYwXULUeuprzo8"; // Unsplash free key

let cafes = [];
let currentIndex = 0;
const pageSize = 5;

// ------------------- Location Handling -------------------
function getLocation() {
    const cache = JSON.parse(localStorage.getItem('cachedLocation') || '{}');
    const now = Date.now();

    if (cache.timestamp && now - cache.timestamp < 10 * 60 * 1000) {
        useLocation(cache.lat, cache.lng);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        pos => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            localStorage.setItem('cachedLocation', JSON.stringify({ lat, lng, timestamp: now }));
            useLocation(lat, lng);
        },
        () => alert("Location access denied or unavailable.")
    );
}

// ------------------- Fetch Cafes from Overpass API -------------------
async function useLocation(lat, lng) {
    const endpoint = `https://overpass-api.de/api/interpreter?data=[out:json];node["amenity"="cafe"](around:2000,${lat},${lng});out;`;

    try {
        const response = await fetch(endpoint);
        const json = await response.json();

        if (!json.elements || !json.elements.length) {
            return alert("No cafes found near you.");
        }

        const data = json.elements.map(cafe => ({
            display_name: cafe.tags.name || "Unnamed Cafe",
            osm_id: cafe.id,
            lat: cafe.lat,
            lon: cafe.lon
        }));

        cafes = data;
        currentIndex = 0;
        displayCards();
    } catch (error) {
        console.error("Error fetching cafes:", error);
        alert("There was an error fetching cafes.");
    }
}

// ------------------- Fetch Image & Address -------------------
async function fetchCafeImage(cafeName) {
    try {
        const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(cafeName + ' cafe interior')}&client_id=${UNSPLASH_ACCESS_KEY}&orientation=landscape&per_page=1`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.results && data.results.length > 0) {
            return data.results[0].urls.small;
        }
        return 'https://placehold.co/250x150/F3CC96/000000?text=No+Image';
    } catch (e) {
        return 'https://placehold.co/250x150/F3CC96/000000?text=No+Image';
    }
}

async function fetchAddress(lat, lon) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
        const response = await fetch(url, { headers: { 'User-Agent': 'SipsAndSpots/1.0 (sham@bmsit.in)' } });
        const data = await response.json();
        return data.display_name || "Address not found";
    } catch (e) {
        console.error("Error fetching address:", e);
        return "Address not found";
    }
}

// ------------------- Rating Functions -------------------
function generateRating() {
    return (Math.random() * (5.0 - 3.5) + 3.5).toFixed(1);
}

function renderStars(rating) {
    let starsHTML = '';
    const fullStars = Math.floor(rating) ;
    const hasHalfStar = rating % 1 >= 0.5;
    for (let i = 0; i < fullStars; i++) starsHTML += '<span>★</span>';
    if (hasHalfStar) starsHTML += '<span>⯪</span>';
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    for (let i = 0; i < emptyStars; i++) starsHTML += '<span>☆</span>';
    return starsHTML;
}

// ------------------- Display Swipe Cards -------------------
async function displayCards() {
    const container = document.querySelector('.cards');
    container.innerHTML = '<h3>Loading Cafes...</h3>';
    // ★ Make sure the cards don't have the "clickable" style in this view
    container.classList.remove('saved-view');

    const pageCafes = cafes.slice(currentIndex, currentIndex + pageSize);
    const imagePromises = pageCafes.map(cafe => fetchCafeImage(cafe.display_name));
    const imageUrls = await Promise.all(imagePromises);
    container.innerHTML = '';

    for (let i = 0; i < pageCafes.length; i++) {
        const cafe = pageCafes[i];
        const imageUrl = imageUrls[i];
        const address = await fetchAddress(cafe.lat, cafe.lon);
        const rating = generateRating();

        const wrapper = document.createElement('div');
        wrapper.className = 'swipe-wrapper';
        wrapper.style.zIndex = 200 - i;

        const card = document.createElement('div');
        card.className = 'location-card';

        const cafeData = { name: cafe.display_name, osm_id: cafe.osm_id, lat: cafe.lat, lon: cafe.lon, photo: imageUrl, address: address, rating: rating };

        card.innerHTML = `
          <article class="cafe-card">
            <div class="cafe-image"><img src="${cafeData.photo}" alt="${cafeData.name}" /></div>
            <div class="cafe-info">
              <h2 class="cafe-name">${cafeData.name}</h2>
              <div class="cafe-rating">
                <span class="rating-number">${cafeData.rating}</span>
                <div class="stars">${renderStars(cafeData.rating)}</div>
              </div>
              <p class="cafe-address">${cafeData.address}</p>
            </div>
          </article>
        `;

        wrapper.appendChild(card);
        container.appendChild(wrapper);

        const hammertime = new Hammer(wrapper);
        hammertime.on('swipeleft', () => {
            wrapper.style.transform = 'translateX(-150%) rotate(-15deg)';
            wrapper.style.opacity = 0;
            setTimeout(() => wrapper.remove(), 300);
        });
        hammertime.on('swiperight', () => {
            saveCafe(cafeData);
            wrapper.style.transform = 'translateX(150%) rotate(15deg)';
            wrapper.style.opacity = 0;
            setTimeout(() => wrapper.remove(), 300);
        });

        if (i < pageCafes.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// ------------------- Refresh & Navigation -------------------
function refreshCafes() {
    if (currentIndex + pageSize < cafes.length) {
        currentIndex += pageSize;
    } else {
        currentIndex = 0;
    }
    displayCards();
}

// ------------------- Save, Delete & Show Saved Cafes -------------------
function saveCafe(cafe) {
    let saved = JSON.parse(localStorage.getItem('savedCafes') || '[]');
    if (!saved.find(c => c.osm_id === cafe.osm_id)) {
        saved.push(cafe);
        localStorage.setItem('savedCafes', JSON.stringify(saved));
    }
    // ★ Automatically go to the saved list after saving a cafe
    showSaved();
}

// ★ NEW FUNCTION: Deletes a cafe from localStorage
function deleteCafe(osm_id) {
    // ★ Show a confirmation dialog before deleting
    if (!confirm('Are you sure you want to delete this cafe from your saved list?')) {
        return; // Stop if the user clicks "Cancel"
    }

    let saved = JSON.parse(localStorage.getItem('savedCafes') || '[]');
    // ★ Create a new array that excludes the cafe we want to delete
    const updatedSaved = saved.filter(cafe => cafe.osm_id !== osm_id);
    localStorage.setItem('savedCafes', JSON.stringify(updatedSaved));

    // ★ Refresh the view to show the updated list
    showSaved();
}


// ★ UPDATED FUNCTION: Now adds a click listener to each saved card
function showSaved() {
    const container = document.querySelector('.cards');
    container.innerHTML = '';
    // ★ Add a class to the container so we can style the saved cards differently
    container.classList.add('saved-view');

    const saved = JSON.parse(localStorage.getItem('savedCafes') || '[]');
    if (!saved.length) {
        container.innerHTML = '<h4 style="color: #3b1e0e;">No saved cafes yet. Swipe right on a cafe to save it!</h4>';
        return;
    }

    saved.forEach(cafe => {
        const card = document.createElement('article');
        card.className = 'cafe-card';

        // ★ Add the click listener to trigger the delete function
        card.onclick = () => deleteCafe(cafe.osm_id);

        card.innerHTML = `
          <div class="cafe-image"><img src="${cafe.photo}" alt="${cafe.name}" /></div>
          <div class="cafe-info">
            <h2 class="cafe-name">${cafe.name}</h2>
            <div class="cafe-rating">
                <span class="rating-number">${cafe.rating}</span>
                <div class="stars">${renderStars(cafe.rating)}</div>
            </div>
            <p class="cafe-address">${cafe.address}</p>
          </div>
        `;
        container.appendChild(card);
    });
}