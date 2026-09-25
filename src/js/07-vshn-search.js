; (function () {
  'use strict'

  // Checks whether a string is empty, blank, null or undefined
  function isEmptyOrBlank (str) {
    return (!str || str.length === 0 || !str.trim())
  }

  // Removes all the children of a node passed as parameter
  function removeAllChildren (node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild)
    }
  }

  // Creates the DOM structure of a single search result item
  // The website variable contains the current domain where this code is running.
  function createSearchResultsDiv (item, website, position, query) {
    var searchParagraph = document.createElement('p')
    searchParagraph.className = 'search-paragraph'

    var searchEntry = document.createElement('a')
    searchEntry.innerText = item.name
    searchEntry.href = item.href
    searchEntry.className = 'search-entry'
    searchParagraph.appendChild(searchEntry)

    var br1 = document.createElement('br')
    searchParagraph.appendChild(br1)

    var searchLink = document.createElement('a')
    searchLink.innerText = website + item.href
    searchLink.href = item.href
    searchLink.className = 'search-link'
    searchParagraph.appendChild(searchLink)

    var br2 = document.createElement('br')
    searchParagraph.appendChild(br2)

    var searchExcerpt = document.createElement('span')
    searchExcerpt.className = 'search-excerpt'
    searchExcerpt.innerText = item.excerpt
    searchParagraph.appendChild(searchExcerpt)

    var searchDiv = document.createElement('div')
    searchDiv.className = 'search-div paragraph'
    searchDiv.onclick = function (e) {
      reportResultClick(query, position)
      if (e.target !== searchEntry) {
        // VINT-2256: don't trigger event if right-clicking on a search result
        window.location.href = item.href
      }
    }
    searchDiv.appendChild(searchParagraph)
    return searchDiv
  }

  // Builds the HTML structure of the list of search results
  // The results variable is an array of objects with 'name', 'href' and 'excerpt' keys.
  // The query variable is a string entered by the user.
  function display (results, query, more) {
    if (isEmptyOrBlank(query)) {
      // Display the original page in lieu of the search results if not done yet
      if (!mainArticle.parentNode) {
        contentDiv.replaceChild(mainArticle, searchArticle)
        if (toc) toc.style.visibility = 'visible'
      }
      return
    }
    // Rebuild the contents of the "search results" page
    removeAllChildren(searchArticle)
    var searchTitle = document.createElement('h1')
    searchTitle.className = 'page'
    searchArticle.appendChild(searchTitle)
    searchTitle.innerText = 'Search Results for "' + query.trim() + '"'
    if (results.length === 0) {
      var searchResult = document.createElement('p')
      searchResult.innerText = 'No results found.'
      searchArticle.appendChild(searchResult)
    } else {
      appendResults(results, query)
      if (more) appendMoreButton(query, more)
    }
    // Replace the current page with a "search results" page if not done yet
    if (!searchArticle.parentNode) {
      if (toc) toc.style.visibility = 'hidden'
      contentDiv.replaceChild(searchArticle, mainArticle)
    }
  }

  function appendResults (results, query) {
    var shown = searchArticle.querySelectorAll('.search-div').length
    results.forEach(function (item, idx) {
      searchArticle.appendChild(createSearchResultsDiv(item, website, shown + idx + 1, query))
    })
  }

  // Each result costs a request for its excerpt, so the rest are fetched only when asked for
  function appendMoreButton (query, more) {
    var button = document.createElement('button')
    button.className = 'search-more'
    button.type = 'button'
    button.innerText = 'Show more results'
    button.addEventListener('click', function () {
      button.disabled = true
      more(PAGE_SIZE).then(function (next) {
        searchArticle.removeChild(button)
        appendResults(next.results, query)
        if (next.more) appendMoreButton(query, next.more)
      })
    })
    searchArticle.appendChild(button)
  }

  // How many results are shown at a time
  var PAGE_SIZE = 5

  // Loads the Pagefind index the site's build generated next to the UI, once.
  // Resolves to null when the site has none, so search falls back to the /search endpoint.
  var pagefind
  function loadPagefind () {
    if (!pagefind) {
      // uiRootPath is set at runtime in head-scripts.hbs
      // eslint-disable-next-line no-undef
      var url = new URL(uiRootPath + '/../pagefind/pagefind.js', window.location.href).href
      // Wait for the page to finish loading: Pagefind starts a web worker, and its handshake times
      // out while the main thread is still busy with the page, after which it searches on the main
      // thread instead, which is far slower.
      pagefind = afterPageLoad()
        .then(function () { return import(url) })
        .then(function (module) {
          return module.init().then(function () { return module })
        })
        .catch(function () { return null })
    }
    return pagefind
  }

  function afterPageLoad () {
    return new Promise(function (resolve) {
      if (document.readyState === 'complete') return resolve()
      window.addEventListener('load', function () { resolve() }, { once: true })
    })
  }

  // Pagefind excerpts mark matches with <mark>; the results page shows plain text
  function plainText (html) {
    return new window.DOMParser().parseFromString(html, 'text/html').body.textContent
  }

  // Performs the actual search, with Pagefind when the site has an index
  function search (query, callback) {
    loadPagefind().then(function (module) {
      if (!module) return serverSearch(query, callback)
      return module.search(query).then(function (response) {
        var total = response.results.length
        var taken = 0
        // fetches the next count results, and says whether any are left
        function take (count) {
          var slice = response.results.slice(taken, taken + count)
          taken += slice.length
          return Promise.all(slice.map(function (result) { return result.data() })).then(function (pages) {
            return { results: pages.map(toResult), more: taken < total ? take : null }
          })
        }
        return take(PAGE_SIZE).then(function (page) {
          callback(page.results, total, page.more)
        })
      })
    })
  }

  function toResult (page) {
    return {
      name: page.meta.title,
      href: page.url,
      excerpt: plainText(page.excerpt),
      version: page.meta.version || '',
    }
  }

  // Searches through the search engine container behind /search, for sites without a Pagefind index
  function serverSearch (query, callback) {
    var XMLHttpRequest = window.XMLHttpRequest
    var xmlhttp = new XMLHttpRequest()

    xmlhttp.onreadystatechange = function () {
      if (xmlhttp.readyState === XMLHttpRequest.DONE) {
        if (xmlhttp.status === 200) {
          var results = JSON.parse(xmlhttp.responseText)
          callback(results, results.length)
        } else if (xmlhttp.status !== 0) {
          // non-zero status indicates a real server error, not a cancelled request
        }
      }
    }

    var url = '/search?q=' + encodeURIComponent(query)
    xmlhttp.open('GET', url, true)
    xmlhttp.send()
  }

  // Reports searches to Plausible when the site loads it (see head-scripts.hbs).
  // A search that ran after a pause in typing is reported only once the reader stays on its results,
  // so partial words typed on the way to the final query are not counted as searches.
  var REPORT_DELAY = 2000
  var pendingReport = null
  var reportTimeout = null
  var lastReportedQuery = null

  function track (name, props) {
    if (typeof window.plausible === 'function') window.plausible(name, { props: props })
  }

  function normalizeQuery (query) {
    return query.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 100)
  }

  function flushReport () {
    if (reportTimeout) clearTimeout(reportTimeout)
    reportTimeout = null
    var report = pendingReport
    pendingReport = null
    if (!report || report.query === lastReportedQuery) return
    lastReportedQuery = report.query
    track('Search', { query: report.query, results: String(report.total) })
  }

  // explicit: the reader pressed Enter or the search button, rather than pausing while typing
  function reportSearch (query, total, explicit) {
    if (reportTimeout) clearTimeout(reportTimeout)
    pendingReport = { query: normalizeQuery(query), total: total }
    if (explicit) flushReport()
    else reportTimeout = setTimeout(flushReport, REPORT_DELAY)
  }

  function reportResultClick (query, position) {
    flushReport()
    track('Search Result Click', { query: normalizeQuery(query), position: String(position) })
  }

  var contentDiv = document.querySelector('.content')
  var mainArticle = document.querySelector('.doc')
  var mainTitle = ''
  var searchInput = document.querySelector('#search-input')
  var searchButton = document.querySelector('.search-button')
  var toc = document.querySelector('.sidebar')
  var website = window.location.protocol + '//' + window.location.host

  // Just to make sure that there is a place where to show search results
  if (!contentDiv || !mainArticle || !searchInput) {
    console.error('Not found required elements in page with CSS classes "main" and "doc",')
    console.error('or a text field with ID "search-input".')
    return
  }

  // Create a placeholder node to show search results
  var searchArticle = document.createElement('article')
  searchArticle.className = 'doc'

  // Timeout to hold 500 milliseconds before searching
  var timeout = null

  // Clears timeout and searches immediately
  function searchNow (explicit) {
    if (timeout) clearTimeout(timeout)
    runQuery(searchInput.value, explicit, true)
  }

  // Runs a query and shows its results. updateHistory is false for a query that came from the URL,
  // which is already the address the reader is on.
  function runQuery (query, explicit, updateHistory) {
    if (isEmptyOrBlank(query)) return
    search(query, function (results, total, more) {
      display(results, query, more)
      if (updateHistory) updateURL(results, query)
      reportSearch(query, total, explicit)
    })
  }

  // Updates URL field when user searches
  function updateURL (results, query) {
    var state = {
      query: query,
      results: results,
    }
    // searchPagePath is set in head-scripts.hbs only when the site defines site.keys.searchPagePath
    // eslint-disable-next-line no-undef
    var path = typeof searchPagePath === 'undefined' ? window.location.pathname : searchPagePath
    window.history.pushState(state, 'Search', path + '?q=' + encodeURIComponent(query))
  }

  // Handles the back button to go back
  // and forth across search results
  window.onpopstate = function (e) {
    if (e.state) {
      searchInput.value = e.state.query
      display(e.state.results, e.state.query)
      document.title = 'Search'
    } else {
      searchInput.value = ''
      contentDiv.replaceChild(mainArticle, searchArticle)
      document.title = mainTitle
    }
  }

  // Clears the previous timeout if any, and sets a new one
  // to search in 500 milliseconds
  function triggerDelayedSearch () {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(function () {
      searchNow(false)
    }, 500)
  }

  // Event to be fired everytime the user presses a key
  searchInput.addEventListener('keyup', function () {
    triggerDelayedSearch()
  })

  // Event to be fired when the input gains focus
  searchInput.addEventListener('focus', function () {
    loadPagefind()
    triggerDelayedSearch()
  })

  // Starts loading Pagefind in the background once the reader shows intent to search,
  // so it is ready by the first search without costing readers who never search
  searchInput.addEventListener('pointerenter', function () {
    loadPagefind()
  })

  // Fetches the index chunks for the typed words while the search waits for the reader to pause
  searchInput.addEventListener('input', function () {
    var query = searchInput.value
    if (isEmptyOrBlank(query)) return
    loadPagefind()
      .then(function (module) {
        if (module) return module.preload(query)
      })
      .catch(function () {}) // a failed preload only means the search fetches the chunks itself
  })

  // VINT-2255: Event to be fired by a search page exposed through OpenSearch
  searchInput.addEventListener('search', function () {
    searchNow(true)
  })

  // If the user presses enter, search directly
  searchInput.addEventListener('keydown', function (event) {
    if (event.keyCode === 13) {
      searchNow(true)
    }
  })

  // If the user clicks on the search icon, search directly
  searchButton.addEventListener('click', function (event) {
    searchNow(true)
  })

  // Open the results when the page is loaded with a ?q= query, from the browser's search box
  // (see the OpenSearch description a site can ship) or from a shared link
  var urlQuery = new URL(window.location.href).searchParams.get('q')
  if (urlQuery && !isEmptyOrBlank(urlQuery)) {
    searchInput.value = urlQuery
    runQuery(urlQuery, true, false)
  }

  // A reader who leaves while results are showing has found their final query
  window.addEventListener('pagehide', flushReport)
})()
