/**
 * @file script.js
 * @description Główna logika interaktywnego portalu cmentarza.
 */

// ====================================================================================
// GŁÓWNA KONFIGURACJA PROJEKTU
// ====================================================================================
const CONFIG = {
	// Adres URL do publicznego pliku CSV z danymi z Arkusza Google
	googleSheetUrl:
		'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4uPrH2HlEG9Yfeo-XA5RG1GOnAQ3JEFZIgS4abTir_2XIy2SxqDwGSK4hCX7W9GAH2kgEHLE-s9G4/pub?output=csv',
	// Adres URL do formularza kontaktowego z serwisu Formspree
	formspreeUrl: 'https://formspree.io/f/xnnbkljy',
	// Współrzędne początkowe i poziom zoomu dla mapy
	mapDefaults: {
		center: [49.496434, 19.859386],
		zoom: 18,
		minZoom: 18,
		maxZoom: 23,
	},
}
// ====================================================================================

// Globalne zmienne
let map;
let markersGroup;
const allTombs = {}; // Przechowuje wszystkie dane o grobach
const allMarkers = {}; // Przechowuje wszystkie markery Leaflet
let selectedMarker = null; // Przechowuje referencję do aktualnie wybranego markera

// Definicja niestandardowych ikon markerów
const defaultIcon = new L.Icon({
	iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
	shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
	iconSize: [25, 41],
	iconAnchor: [12, 41],
	popupAnchor: [1, -34],
	shadowSize: [41, 41]
});

const selectedIcon = new L.Icon({
	iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
	shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
	iconSize: [25, 41],
	iconAnchor: [12, 41],
	popupAnchor: [1, -34],
	shadowSize: [41, 41]
});


/**
 * Inicjalizuje wszystkie komponenty strony po załadowaniu DOM.
 */
document.addEventListener('DOMContentLoaded', () => {
	initMap();
	fetchData();
	initEventListeners();
	initGalleryEventListeners(); // Inicjalizacja galerii
});

/**
 * Inicjalizuje mapę Leaflet z warstwami.
 */
function initMap() {
	map = L.map('map', {
		center: CONFIG.mapDefaults.center,
		zoom: CONFIG.mapDefaults.zoom,
		minZoom: CONFIG.mapDefaults.minZoom,
		maxZoom: CONFIG.mapDefaults.maxZoom,
	});

	const googleSat = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
		subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
		attribution: '&copy; Google',
		maxZoom: 21,
	}).addTo(map);

	const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
		attribution: '&copy; OpenStreetMap',
		maxZoom: 19,
	});

	const ortho = L.tileLayer('tiles/{z}/{x}/{y}.png', {
		attribution: 'Ortofotomapa',
		minZoom: 18,
		maxZoom: 23,
	}).addTo(map);

	L.control
		.layers({
			'Zdjęcie Satelitarne': googleSat,
			'Mapa Ulic': osm,
		}, {
			Ortofotomapa: ortho,
		}, {
			collapsed: true,
		})
		.addTo(map);

	markersGroup = L.markerClusterGroup({
		chunkedLoading: true,
		disableClusteringAtZoom: 22,
		maxClusterRadius: 50,
	}).addTo(map);
}

/**
 * Pobiera i przetwarza dane z Arkusza Google.
 */
function fetchData() {
	Papa.parse(CONFIG.googleSheetUrl, {
		download: true,
		header: true,
		complete: results => {
			processData(results.data);
			displayAnniversaries();
		},
		error: err => {
			console.error('Błąd podczas pobierania lub parsowania danych CSV:', err);
			document.getElementById('anniversaries-placeholder').textContent = 'Nie udało się załadować danych.';
		},
	});
}

/**
 * Przetwarza dane z CSV i grupuje osoby w grobach.
 */
function processData(rows) {
    rows.forEach(item => {
        if (!item.lat || !item.lng || !item.kwatera) return;
        
        const appKey = [item.kwatera, item.rzad, item.miejsce].filter(Boolean).join('_');
        const photoKey = [item.kwatera, item.rzad || '', item.miejsce || ''].join('_');

        if (!allTombs[appKey]) {
            allTombs[appKey] = {
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lng),
                persons: [],
                photos: [`images/${photoKey}_1.jpg`, `images/${photoKey}_2.jpg`],
                kwatera: item.kwatera,
                rzad: item.rzad || '',
                miejsce: item.miejsce || ''
            };
        }
        allTombs[appKey].persons.push({
            name: `${item.imie} ${item.nazwisko}`,
            birth: item.data_urodzenia,
            death: item.data_smierci,
        });
    });
    addMarkersToMap();
}

/**
 * Dodaje markery dla wszystkich grobów na mapę.
 */
function addMarkersToMap() {
	markersGroup.clearLayers();
	Object.entries(allTombs).forEach(([key, tomb]) => {
		const marker = L.marker([tomb.lat, tomb.lng], {
			icon: defaultIcon
		});
		marker.on('click', () => showInfoPanel(key));
		markersGroup.addLayer(marker);
		allMarkers[key] = marker;
	});
}

/**
 * Wyświetla panel z informacjami o wybranym grobie i podświetla marker.
 * @param {string} key - Klucz identyfikujący grób.
 */
function showInfoPanel(key) {
	if (selectedMarker) {
		selectedMarker.setIcon(defaultIcon);
	}

	const panel = document.getElementById('info-panel');
	const tomb = allTombs[key];
	const marker = allMarkers[key];

	if (!tomb || !marker) return;

	marker.setIcon(selectedIcon);
	selectedMarker = marker;

	const { kwatera, rzad, miejsce } = tomb;

	const personsHTML = tomb.persons
		.map(
			p => `
        <div class="person-entry mb-3">
            <p class="text-xl md:text-2xl font-bold font-serif" style="font-family: 'Lora', serif;">${p.name}</p>
            <p class="text-sm text-stone-600">Ur. ${p.birth || 'brak danych'}, Zm. ${p.death || 'brak danych'}</p>
        </div>
    `
		)
		.join('');

	panel.innerHTML = `
    <div class="p-4 md:p-6 border-b border-stone-200 bg-stone-50/50">
        <div class="flex flex-col md:flex-row md:justify-center md:items-start gap-4">
            <div class="flex flex-row gap-4 w-full md:w-auto">
                <img src="${tomb.photos[0]}" alt="Zdjęcie grobu ${kwatera} ${rzad} ${miejsce}" class="gallery-img w-1/2 md:w-[300px] h-auto rounded-lg cursor-pointer hover:opacity-80 transition object-contain" loading="lazy" onerror="this.style.display='none'">
                <img src="${tomb.photos[1]}" alt="Zdjęcie tablicy grobu ${kwatera} ${rzad} ${miejsce}" class="gallery-img w-1/2 md:w-[300px] h-auto rounded-lg cursor-pointer hover:opacity-80 transition object-contain" loading="lazy" onerror="this.style.display='none'">
            </div>
            <div class="flex-grow md:pl-5 md:max-w-md">
                ${personsHTML}
                <div class="location mt-4 pt-4 border-t border-stone-200">
                    <h4 class="font-semibold text-stone-600 mb-2">Lokalizacja</h4>
                    <div class="loc-line text-sm text-stone-600 flex flex-wrap gap-x-4 gap-y-1">
                        <span>Kwatera: <strong>${kwatera}</strong></span>
                        <span>Rząd: <strong>${rzad}</strong></span>
                        <span>Miejsce: <strong>${miejsce}</strong></span>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;

	panel.classList.remove('hidden');
	bindImageViewer();
	panel.scrollIntoView({
		behavior: 'smooth',
		block: 'start',
	});
}

/**
 * Filtruje dane na podstawie wprowadzonego tekstu.
 */
function applyFilter() {
    const filterText = document.getElementById('filter-name').value.toLowerCase().trim();
    if (!filterText) return;

    const flatMatches = [];
    Object.entries(allTombs).forEach(([key, tomb]) => {
        tomb.persons.forEach(person => {
            if (person.name.toLowerCase().includes(filterText)) {
                flatMatches.push({
                    ...person,
                    tombKey: key,
                    lat: tomb.lat,
                    lng: tomb.lng,
                    kwatera: tomb.kwatera,
                    rzad: tomb.rzad,
                    miejsce: tomb.miejsce
                });
            }
        });
    });

    const matchedKeys = [...new Set(flatMatches.map(p => p.tombKey))];
    markersGroup.clearLayers();
    matchedKeys.forEach(key => {
        if (allMarkers[key]) {
            markersGroup.addLayer(allMarkers[key]);
        }
    });

    updateResultsTable(flatMatches);
    document.getElementById('info-panel').classList.add('hidden');
}


/**
 * Helper function to convert Roman numerals to integers.
 * @param {string} roman
 * @returns {number}
 */
function romanToNumber(roman) {
	if (!roman || typeof roman !== 'string') return 0;
	const map = {
		I: 1, V: 5, X: 10, L: 50, C: 100
	};
	let result = 0;
	for (let i = 0; i < roman.length; i++) {
		const current = map[roman[i].toUpperCase()];
		const next = map[roman[i + 1]?.toUpperCase()];
		if (current < next) {
			result -= current;
		} else {
			result += current;
		}
	}
	return result;
}

/**
 * Helper function to parse plot numbers (e.g., "12a") into number and suffix.
 * @param {string} place
 * @returns {{number: number, suffix: string}}
 */
function parsePlace(place) {
	if (!place) return { number: 0, suffix: '' };
	const match = place.match(/^(\d+)(.*)$/);
	if (match) {
		return {
			number: parseInt(match[1], 10),
			suffix: match[2].toLowerCase()
		};
	}
	return { number: 0, suffix: place.toLowerCase() };
}


/**
 * Aktualizuje tabelę wyników wyszukiwania, sortując wyniki.
 * @param {Array} flatMatches - Spłaszczona tablica pasujących osób.
 */
function updateResultsTable(flatMatches) {
	const tbody = document.getElementById('results-tbody');
	const section = document.getElementById('results-section');
	const resultsTitle = section.querySelector('h3');
	tbody.innerHTML = '';

	if (flatMatches.length === 0) {
		tbody.innerHTML = `
            <tr>
                <td colspan="4" class="p-4 text-center text-stone-500">Nie znaleziono pasujących wyników.</td>
            </tr>
        `;
	} else {
		flatMatches.sort((a, b) => {
			const nameA = a.name.split(' ').reverse().join(' ');
			const nameB = b.name.split(' ').reverse().join(' ');
			if (nameA.localeCompare(nameB) !== 0) {
				return nameA.localeCompare(nameB, 'pl', {
					sensitivity: 'base'
				});
			}

            const { kwatera: kwateraA, rzad: rzadA, miejsce: miejsceA } = a;
            const { kwatera: kwateraB, rzad: rzadB, miejsce: miejsceB } = b;

			if (kwateraA.localeCompare(kwateraB) !== 0) {
				return kwateraA.localeCompare(kwateraB, 'pl', {
					sensitivity: 'base'
				});
			}

			const rzadNumA = romanToNumber(rzadA);
			const rzadNumB = romanToNumber(rzadB);
			if (rzadNumA !== rzadNumB) {
				return rzadNumA - rzadNumB;
			}

			const miejsceParsedA = parsePlace(miejsceA);
			const miejsceParsedB = parsePlace(miejsceB);
			if (miejsceParsedA.number !== miejsceParsedB.number) {
				return miejsceParsedA.number - miejsceParsedB.number;
			}

			return miejsceParsedA.suffix.localeCompare(miejsceParsedB.suffix, 'pl', {
				sensitivity: 'base'
			});
		});

		flatMatches.forEach(person => {
			const tr = document.createElement('tr');
			tr.className = "cursor-pointer hover:bg-stone-50";
            const locationString = [person.kwatera, person.rzad, person.miejsce].filter(Boolean).join(' ');
			tr.innerHTML = `
                    <td class="p-3">${person.name}</td>
                    <td class="p-3">${person.birth || 'brak danych'}</td>
                    <td class="p-3">${person.death || 'brak danych'}</td>
                    <td class="p-3">${locationString}</td>
                `;
			tr.addEventListener('click', () => {
				map.setView([person.lat, person.lng], 23);
				showInfoPanel(person.tombKey);
			});
			tbody.appendChild(tr);
		});
	}

	section.classList.remove('hidden');
	resultsTitle.scrollIntoView({
		behavior: 'smooth',
		block: 'start'
	});
}

/**
 * Resetuje wyszukiwarkę i widok mapy.
 */
function resetSearch() {
	if (selectedMarker) {
		selectedMarker.setIcon(defaultIcon);
		selectedMarker = null;
	}
	document.getElementById('filter-name').value = '';
	document.getElementById('info-panel').classList.add('hidden');
	document.getElementById('results-section').classList.add('hidden');
	markersGroup.clearLayers();
	Object.values(allMarkers).forEach(marker => markersGroup.addLayer(marker));
	map.setView(CONFIG.mapDefaults.center, CONFIG.mapDefaults.zoom);
}

/**
 * Wyświetla listę nadchodzących rocznic śmierci.
 */
function displayAnniversaries() {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const upcoming = [];

	Object.values(allTombs).forEach(tomb => {
		tomb.persons.forEach(person => {
			if (person.death) {
				const deathDate = new Date(person.death);
				if (isNaN(deathDate.getTime())) return;
				const anniversary = new Date(today.getFullYear(), deathDate.getMonth(), deathDate.getDate());
				if (anniversary < today) {
					anniversary.setFullYear(today.getFullYear() + 1);
				}
				const diffDays = Math.ceil((anniversary - today) / (1000 * 60 * 60 * 24));
				if (diffDays >= 0 && diffDays <= 5) {
					upcoming.push({
						name: person.name,
						date: anniversary.toLocaleDateString('pl-PL'),
						daysUntil: diffDays,
					});
				}
			}
		});
	});

	upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
	const listContainer = document.getElementById('anniversaries-list');
	const placeholder = document.getElementById('anniversaries-placeholder');
	if (upcoming.length > 0) {
		placeholder.style.display = 'none';
		listContainer.innerHTML = upcoming
			.map(
				p => `
            <div class="anniversary-item">
                <p class="font-semibold">${p.name}</p>
                <p class="text-sm text-stone-600">Rocznica: ${p.date} (${
					p.daysUntil === 0 ? 'dzisiaj' : 'za ' + p.daysUntil + ' dni'
				})</p>
            </div>
        `
			)
			.join('');
	} else {
		placeholder.textContent = 'Brak nadchodzących rocznic w najbliższych 5 dniach.';
	}
}

/**
 * Inicjalizuje główne nasłuchiwacze zdarzeń.
 */
function initEventListeners() {
	document.getElementById('btn-search').addEventListener('click', applyFilter);
	document.getElementById('btn-reset').addEventListener('click', resetSearch);
	document.getElementById('filter-name').addEventListener('keydown', e => {
		if (e.key === 'Enter') applyFilter();
	});

	const form = document.getElementById('contact-form');
	const formContainer = document.getElementById('report-error-form-container');
	const reportBtn = document.getElementById('report-error-btn');
	const introText = document.getElementById('report-error-intro');

	reportBtn.addEventListener('click', () => {
		formContainer.classList.toggle('open');
		reportBtn.classList.add('hidden');
		introText.classList.add('hidden');
	});

	form.addEventListener('submit', handleFormSubmit);
}

/**
 * Obsługuje wysyłkę formularza kontaktowego.
 * @param {Event} event - Zdarzenie wysłania formularza.
 */
async function handleFormSubmit(event) {
	event.preventDefault();
	const form = event.target;
	const statusMessage = document.getElementById('form-status-message');
	const submitBtn = document.getElementById('form-submit-btn');
	const data = new FormData(form);
	statusMessage.textContent = 'Wysyłanie...';
	statusMessage.className = 'mt-4 text-center p-3 rounded-md bg-yellow-100 text-yellow-800';
	submitBtn.disabled = true;

	try {
		const response = await fetch(CONFIG.formspreeUrl, {
			method: 'POST',
			body: data,
			headers: {
				Accept: 'application/json'
			},
		});
		if (response.ok) {
			statusMessage.textContent = 'Dziękujemy! Twoja wiadomość została wysłana.';
			statusMessage.className = 'mt-4 text-center p-3 rounded-md bg-green-100 text-green-800';
			form.reset();
			setTimeout(() => {
				formContainer.classList.remove('open');
				reportBtn.classList.remove('hidden');
				introText.classList.remove('hidden');
				statusMessage.className = 'hidden';
			}, 5000);
		} else {
			throw new Error('Problem z wysłaniem formularza');
		}
	} catch (error) {
		statusMessage.textContent = 'Wystąpił błąd. Spróbuj ponownie później.';
		statusMessage.className = 'mt-4 text-center p-3 rounded-md bg-red-100 text-red-800';
	} finally {
		submitBtn.disabled = false;
	}
}

// --- LOGIKA GALERII ZDJĘĆ Z ZOOMEM ---

let currentImageIndex = 0;
let currentImageSet = [];
const galleryImage = document.getElementById('gallery-image');

// Zmienne stanu dla powiększania i przesuwania
let scale = 1,
	moveX = 0,
	moveY = 0,
	isPanning = false,
	startX,
	startY;

function bindImageViewer() {
	const images = document.querySelectorAll('.gallery-img');
	currentImageSet = Array.from(images).map(img => img.src);
	images.forEach((img, index) => {
		img.addEventListener('click', () => openGallery(index));
	});
}

function openGallery(index) {
	currentImageIndex = index;
	// Resetuj zoom i pozycję przy otwieraniu nowego zdjęcia
	scale = 1;
	moveX = 0;
	moveY = 0;
	updateGalleryImage();
	document.getElementById('gallery-modal').classList.remove('hidden');
	document.addEventListener('keydown', handleKeyPress);
}

function closeGallery() {
	document.getElementById('gallery-modal').classList.add('hidden');
	document.removeEventListener('keydown', handleKeyPress);
}

function updateGalleryImage() {
	galleryImage.src = currentImageSet[currentImageIndex];
	galleryImage.style.transform = `translate(${moveX}px, ${moveY}px) scale(${scale})`;
}

function showNextImage() {
	currentImageIndex = (currentImageIndex + 1) % currentImageSet.length;
	scale = 1;
	moveX = 0;
	moveY = 0;
	updateGalleryImage();
}

function showPrevImage() {
	currentImageIndex = (currentImageIndex - 1 + currentImageSet.length) % currentImageSet.length;
	scale = 1;
	moveX = 0;
	moveY = 0;
	updateGalleryImage();
}

function handleKeyPress(e) {
	if (e.key === 'Escape') closeGallery();
	if (e.key === 'ArrowRight') showNextImage();
	if (e.key === 'ArrowLeft') showPrevImage();
}

function handleWheel(e) {
	e.preventDefault();
	scale += e.deltaY * -0.001;
	scale = Math.min(Math.max(0.5, scale), 5); // Ogranicz zoom
	updateGalleryImage();
}

function handleMouseDown(e) {
	e.preventDefault();
	isPanning = true;
	startX = e.clientX - moveX;
	startY = e.clientY - moveY;
	galleryImage.classList.add('grabbing');
	document.addEventListener('mousemove', handleMouseMove);
	document.addEventListener('mouseup', handleMouseUp);
}

function handleMouseMove(e) {
	if (!isPanning) return;
	e.preventDefault();
	moveX = e.clientX - startX;
	moveY = e.clientY - startY;
	updateGalleryImage();
}

function handleMouseUp() {
	isPanning = false;
	galleryImage.classList.remove('grabbing');
	document.removeEventListener('mousemove', handleMouseMove);
	document.removeEventListener('mouseup', handleMouseUp);
}

// Inicjalizacja nasłuchiwaczy dla galerii - robimy to raz
function initGalleryEventListeners() {
	document.getElementById('gallery-close').addEventListener('click', closeGallery);
	document.getElementById('gallery-next').addEventListener('click', showNextImage);
	document.getElementById('gallery-prev').addEventListener('click', showPrevImage);
	document.getElementById('gallery-modal').addEventListener('click', e => {
		if (e.target.id === 'gallery-modal') closeGallery();
	});
	galleryImage.addEventListener('wheel', handleWheel);
	galleryImage.addEventListener('mousedown', handleMouseDown);
}



