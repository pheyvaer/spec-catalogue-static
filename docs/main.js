import * as csvStringify from 'https://cdn.jsdelivr.net/npm/csv-stringify@6.5.2/+esm';
import {
  Grid,
  html
} from "https://unpkg.com/gridjs?module";

let shownSpecs = [];
let latestSpecsFromSearch = [];
let grid;
let specTitleToUrl = {};
const columnsConfig = [{
  name: 'Title',
  id: "title",
  formatter: (_, row) => html(`<a href='${specTitleToUrl[row.cells[0].data]}'>${row.cells[0].data}</a>`)
}, {
  name: "Description",
  hidden: true,
  sort: {
    compare: compareDescription
  }
}, "Status", {
  name: "Last updated",
  sort: {
    compare: compareLastUpdated
  }
}, {
  name: "KNoWS' action",
  id: "actions"
}];
const gridConfig = {
  columns: columnsConfig,
  sort: true,
  data: []
};

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
    if (input.id !== "show-description") {
      input.addEventListener("change", applyFilters);
    }
  });

  document.getElementById("show-description").addEventListener("change", () => {
    columnsConfig[1].hidden = !document.getElementById("show-description").checked;

    grid.updateConfig({
      columns: columnsConfig
    }).forceRender();
  });

  document.getElementById("last-updated-after-date").addEventListener("input", applyFilters);
  document.getElementById("download-results-button").addEventListener("click", downloadResults);

  grid = new Grid(gridConfig).render(document.getElementById("wrapper"));

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

  const selectedStatuses = Array.from(document.querySelectorAll("#status-dropdown input"))
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
    } else if (spec.meta["Last updated"]) {
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
    const gridData = specs.map(spec => {
      specTitleToUrl[spec.meta.title] = spec.url;

      return {
        title: spec.meta.title,
        description: spec.meta.description,
        lastUpdated: spec.meta["Last updated"],
        actions: getHighestAction(spec.filters.Action),
        status: spec.filters.status.join(", ")
      }
    });

    grid.updateConfig({
      data: gridData
    }).forceRender();

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
      description: spec.meta.description,
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

function download(content, mimeType, filename) {
  const a = document.createElement('a') // Create "a" element
  const blob = new Blob([content], {type: mimeType}) // Create a blob (file-like object)
  const url = URL.createObjectURL(blob) // Create an object URL from blob
  a.setAttribute('href', url) // Set "a" element link
  a.setAttribute('download', filename) // Set download filename
  a.click() // Start downloading
}

function compareLastUpdated(a, b) {
  if (!a) {
    return 1;
  }

  if (!b) {
    return -1
  }

  a = new Date(a);
  b = new Date(b);

  if (a < b) {
    return -1;
  } else if (a > b) {
    return 1;
  } else {
    return 0;
  }
}

function compareDescription(a, b) {
  if (!a) {
    return 1;
  }

  if (!b) {
    return -1
  }

  if (a < b) {
    return -1;
  } else if (a > b) {
    return 1;
  } else {
    return 0;
  }
}

function getHighestAction(actions) {
  if (actions.includes("Lead")) {
    return "Lead";
  } else if (actions.includes("Create")) {
    return "Create";
  } else if (actions.includes("Contribute")) {
    return "Contribute";
  } else {
    return "Endorse"
  }
}
