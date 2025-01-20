import * as csvStringify from 'https://cdn.jsdelivr.net/npm/csv-stringify@6.5.2/+esm'

let shownSpecs = [];
let latestSpecsFromSearch = [];

window.addEventListener('DOMContentLoaded', async () => {
  // new PagefindUI({element: "#search", showSubResults: true});
  const pagefind = await import("./pagefind/pagefind.js");
  pagefind.init();
  document.getElementById("search-input").addEventListener("input", async () => {
    let searchValue = document.getElementById("search-input").value;
    if (searchValue === "") {
      searchValue = null;
    }
    const search = await pagefind.search(searchValue);
    processSearchValue(search);
  });

  document.querySelectorAll("input[type='checkbox']").forEach(input => {
    input.addEventListener("change", applyFilters);
  });
  document.getElementById("last-updated-after-date").addEventListener("input", applyFilters);
  document.getElementById("download-results-button").addEventListener("click", downloadResults);

  // Show all specifications when loading the page.
  const search = await pagefind.search(null);
  processSearchValue(search);

  const response2 = await fetch("./builder.json");
  const builder = await response2.json();
  document.getElementById("latest-run").innerText = dateFns.format(new Date(builder.dateTime), "yyyy-MM-dd kk:mm O");
});

async function processSearchValue(search) {
  const results = await Promise.all(search.results.slice(0, 1000).map(r => r.data()));
  latestSpecsFromSearch = results;

  applyFilters();
}

function applyFilters() {
  document.getElementById("filters-error-message").classList.add("d-none");
  document.getElementById("no-results-message").classList.add("d-none");

  const selectedActions = Array.from(document.querySelectorAll("#action-dropdown input"))
    .filter(input => input.checked)
    .map(input => input.value);
  console.log(selectedActions);

  const selectedStatuses =  Array.from(document.querySelectorAll("#status-dropdown input"))
    .filter(input => input.checked)
    .map(input => input.value);
  console.log(selectedStatuses);

  let afterDate = document.getElementById("last-updated-after-date").value;

  console.log(afterDate);

  if (afterDate) {
    if (dateFns.isMatch(afterDate, "yyyy-MM-dd")) {
      afterDate = new Date(afterDate);

      if (afterDate.toString() === "Invalid Date") {
        console.error(`Invalid after date: ` + document.getElementById("last-updated-after-date").value);
        document.querySelector("#filters-error-message .col").innerText = `Invalid value for "Last updated after".`;
        document.getElementById("filters-error-message").classList.remove("d-none");
        return;
      }
    } else {
      console.error(`Invalid after date format: ` + afterDate);
      document.querySelector("#filters-error-message .col").innerText = `Invalid date format for "Last updated after".`;
      document.getElementById("filters-error-message").classList.remove("d-none");
      return;
    }
  }

  console.log(afterDate);

  const filteredSpecs = latestSpecsFromSearch.filter(spec => {
    if (!afterDate) {
      return spec.filters.Action.some(action => selectedActions.includes(action))
        && spec.filters.status.some(status => selectedStatuses.includes(status));
    } else if (spec.meta["Last updated"]){
      return spec.filters.Action.some(action => selectedActions.includes(action))
        && spec.filters.status.some(status => selectedStatuses.includes(status))
        && (new Date(spec.meta["Last updated"]) > afterDate);
    }

    return false;
  });

  console.log(filteredSpecs);
  showSpecs(filteredSpecs);
}

function showSpecs(specs) {
  if (specs.length === 0) {
    document.getElementById("no-results-message").classList.remove("d-none");
    document.getElementById("search-results").classList.add("d-none");
    document.getElementById("download-results").classList.add("d-none");
  } else {
    let tbody = ``;

    for (const spec of specs) {
      tbody += `<tr><th scope="row"><a href="${spec.url}">${spec.meta.title}</a></th><td>${spec.meta.status}</td><td>${spec.meta["Last updated"] || ""}</td><td>${spec.filters.Action.join(", ")}</td>`
    }

    document.getElementById("result-table-body").innerHTML = tbody;
    document.getElementById("no-results-message").classList.add("d-none");
    document.getElementById("search-results").classList.remove("d-none");
    document.getElementById("download-results").classList.remove("d-none");
  }

  shownSpecs = specs;
}

function downloadResults() {
  const data = shownSpecs.map(spec => {
    return {
      title: spec.meta.title,
      url: spec.url,
      lastUpdated: spec.meta["Last updated"],
      actions: spec.filters.Action.join(", "),
      status: spec.filters.status.join(", ")
    }
  });

  csvStringify.stringify(data, {
    header: true
  }, (err, output) => {
    console.log(output);
    download(output, "text/csv", "specs.csv");
  });
}

function download(content, mimeType, filename){
  const a = document.createElement('a') // Create "a" element
  const blob = new Blob([content], {type: mimeType}) // Create a blob (file-like object)
  const url = URL.createObjectURL(blob) // Create an object URL from blob
  a.setAttribute('href', url) // Set "a" element link
  a.setAttribute('download', filename) // Set download filename
  a.click() // Start downloading
}
