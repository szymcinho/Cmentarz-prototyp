// 1. Globalne zmienne
let map, markersGroup
const tombsData = {},
	allMarkers = {}

// 2. Start aplikacji
window.addEventListener('DOMContentLoaded', () => {
	initMap()
	fetchData()

	// Szukaj po kliknięciu
	document.getElementById('btn-search').addEventListener('click', applyFilter)

	// Reset po kliknięciu
	document.getElementById('btn-reset').addEventListener('click', resetSearch)

	// Enter w polach → Szukaj
	;['filter-name', 'filter-date'].forEach(id => {
		document.getElementById(id).addEventListener('keydown', e => {
			if (e.key === 'Enter') {
				e.preventDefault()
				applyFilter()
			}
		})
	})
})

// 3. Inicjalizacja mapy
function initMap() {
	map = L.map('map', {
		center: [49.496434, 19.859386],
		zoom: 18,
		minZoom: 14,
		maxZoom: 24,
	})

	// Base layers
	const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
		attribution: '&copy; OpenStreetMap',
		maxZoom: 19,
	}).addTo(map)

	const googleSat = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
		subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
		attribution: '&copy; Google',
		maxZoom: 21,
	})

	// Overlay: ortofotomapa
	const ortho = L.tileLayer('tiles/{z}/{x}/{y}.png', {
		attribution: 'Ortofotomapa',
		minZoom: 14,
		maxZoom: 24,
	}).addTo(map)

	// Kontroler warstw
	L.control.layers({ OSM: osm, 'Google Satellite': googleSat }, { Ortofotomapa: ortho }, { collapsed: true }).addTo(map)

	// Grupa markerów z klastrowaniem
	markersGroup = L.markerClusterGroup({
		chunkedLoading: true,
		disableClusteringAtZoom: 18,
		maxClusterRadius: 50,
	}).addTo(map)
}

// 4. Pobranie i parsowanie CSV z Google Sheets
function fetchData() {
	const csvUrl =
		'https://docs.google.com/spreadsheets/d/e/2PACX-1vTzfNZiYgXRxO8XjvNHoX2vYnKz7IWFmFKEedDdyXv3BeCd1uq0wLdOJ8Z68WCnK04wJ8yRkJRvXDEm/pub?output=csv'

	fetch(csvUrl)
		.then(res => res.text())
		.then(text => {
			const { data } = Papa.parse(text, { header: true })
			processData(data)
		})
		.catch(err => console.error('Błąd pobierania arkusza:', err))
}

// 5. Przetwarzanie wierszy CSV
function processData(rows) {
	// Czyścimy poprzednie dane
	Object.keys(tombsData).forEach(k => delete tombsData[k])

	rows.forEach(item => {
		const key = `${item.kwatera}_${item.rzad}_${item.miejsce}`
		if (!tombsData[key]) {
			tombsData[key] = {
				lat: parseFloat(item.lat),
				lng: parseFloat(item.lng),
				persons: [],
				photos: [`images/${key}_1.jpg`, `images/${key}_2.jpg`],
			}
		}
		tombsData[key].persons.push({
			name: `${item.imie} ${item.nazwisko}`,
			birth: item.data_urodzenia,
			death: item.data_smierci,
		})
	})

	addMarkers()
}

// 6. Dodawanie markerów i podpięcie click → panel
function addMarkers() {
	markersGroup.clearLayers()
	Object.entries(tombsData).forEach(([key, tomb]) => {
		const m = L.marker([tomb.lat, tomb.lng], { tombKey: key })
		m.on('click', () => {
			map.setView([tomb.lat, tomb.lng], map.getZoom())
			showInfoPanel(key)
		})
		markersGroup.addLayer(m)
		allMarkers[key] = m
	})
}

// 7. Filtrowanie i tabela
function applyFilter() {
	const nameF = document.getElementById('filter-name').value.toLowerCase()
	const dateF = document.getElementById('filter-date').value
	const matches = []

	Object.entries(tombsData).forEach(([key, tomb]) => {
		const okN = !nameF || tomb.persons.some(p => p.name.toLowerCase().includes(nameF))
		const okD = !dateF || tomb.persons.some(p => p.birth === dateF || p.death === dateF)
		if (okN && okD) matches.push(key)
	})

	markersGroup.clearLayers()
	matches.forEach(k => markersGroup.addLayer(allMarkers[k]))
	updateTable(matches)
}

// 8. Aktualizacja tabeli wyników
function updateTable(keys) {
	const tbody = document.querySelector('#results tbody')
	tbody.innerHTML = ''
	keys.forEach(key => {
		const tomb = tombsData[key]
		tomb.persons.forEach(p => {
			const tr = document.createElement('tr')
			tr.innerHTML = `<td>${p.name}</td><td>${p.birth}</td><td>${p.death}</td>`
			tr.addEventListener('click', () => {
				map.setView([tomb.lat, tomb.lng], 18)
				showInfoPanel(key)
			})
			tbody.appendChild(tr)
		})
	})
}

// 9. Wyświetlanie panelu z informacjami nad mapą
function showInfoPanel(key) {
	const panel = document.getElementById('info-panel')
	const tomb = tombsData[key]
	const [kwatera, rzad, miejsce] = key.split('_')

	// HTML dla osób
	const personsHTML = tomb.persons
		.map(
			p => `
    <div class="person-entry">
      <div class="name">${p.name}</div>
      <div class="birth">Urodzony(a): ${p.birth}</div>
      <div class="death">Zmarł(a): ${p.death}</div>
      <hr>
    </div>
  `
		)
		.join('')

	panel.innerHTML = `
    <div class="info-container">
      <div class="images">
        <img src="${tomb.photos[0]}" alt="Zdjęcie grobu">
        <img src="${tomb.photos[1]}" alt="Zdjęcie tablicy">
      </div>
      <div class="details">
        <section class="people">
          ${personsHTML}
        </section>
        <section class="location">
          <h4>Lokalizacja</h4>
          <div class="loc-line">
            <span>Kwatera: <strong>${kwatera}</strong></span>
            <span>Rząd: <strong>${rzad}</strong></span>
            <span>Miejsce: <strong>${miejsce}</strong></span>
          </div>
          <div class="loc-gps">
            GPS: <strong>${tomb.lat.toFixed(6)}, ${tomb.lng.toFixed(6)}</strong>
          </div>
        </section>
      </div>
    </div>
  `
	panel.classList.remove('hidden')
	bindImageViewer()
}

// 10. Reset wyszukiwania
function resetSearch() {
	document.getElementById('filter-name').value = ''
	document.getElementById('filter-date').value = ''
	addMarkers()
	updateTable([])
	document.getElementById('info-panel').classList.add('hidden')
}

// 11. IMAGE VIEWER: click & scroll-zoom
function openImageViewer(src) {
	const ov = document.createElement('div')
	ov.className = 'img-viewer-overlay'
	const img = document.createElement('img')
	img.src = src
	let scale = 1,
		moveX = 0,
		moveY = 0,
		startX,
		startY,
		isDown = false

	img.addEventListener('wheel', e => {
		e.preventDefault()
		scale += e.deltaY * -0.001
		scale = Math.min(Math.max(0.5, scale), 5)
		img.style.transform = `translate(${moveX}px, ${moveY}px) scale(${scale})`
	})

	img.addEventListener('mousedown', e => {
		isDown = true
		img.style.cursor = 'grabbing'
		startX = e.clientX - moveX
		startY = e.clientY - moveY
	})
	document.addEventListener('mouseup', () => {
		isDown = false
		img.style.cursor = 'grab'
	})
	document.addEventListener('mousemove', e => {
		if (!isDown) return
		moveX = e.clientX - startX
		moveY = e.clientY - startY
		img.style.transform = `translate(${moveX}px, ${moveY}px) scale(${scale})`
	})

	ov.addEventListener('click', e => {
		if (e.target === ov) document.body.removeChild(ov)
	})

	ov.appendChild(img)
	document.body.appendChild(ov)
}

// 12. Podpinanie lightboxa
function bindImageViewer() {
	document.querySelectorAll('#info-panel .images img').forEach(img => {
		img.style.cursor = 'zoom-in'
		img.addEventListener('click', () => openImageViewer(img.src))
	})
}
