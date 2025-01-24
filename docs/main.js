/* eslint-disable no-undef */
// We disable the no-undef rule because it gets triggered by window, document, and dateFns.

import * as csvStringify from "https://cdn.jsdelivr.net/npm/csv-stringify@6.5.2/+esm";
import {
  Grid,
  html
} from "https://unpkg.com/gridjs?module";

let shownSpecs = [];
let latestSpecsFromSearch = [];
let grid;
const specTitleToUrl = {};
const columnsConfig = [{
  name: "Title",
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

window.addEventListener("DOMContentLoaded", async () => {
  // new PagefindUI({element: "#search", showSubResults: true});
  const pagefind = await import("./pagefind/pagefind.js");
  pagefind.init();
  document.getElementById("search-input").addEventListener("input", debounce(async () => {
    let searchValue = document.getElementById("search-input").value;
    if (searchValue === "") {
      searchValue = null;
    }
    const search = await pagefind.search(searchValue);
    processSearchValue(search);
  }, 300));

  document.querySelectorAll("input[type='checkbox']").forEach(input => {
    if (input.id !== "show-description") {
      input.addEventListener("change", applyFiltersAndShowSpecs);
    }
  });

  document.getElementById("show-description").addEventListener("change", () => {
    columnsConfig[1].hidden = !document.getElementById("show-description").checked;

    grid.updateConfig({
      columns: columnsConfig
    }).forceRender();
  });

  document.getElementById("last-updated-after-date").addEventListener("input", applyFiltersAndShowSpecs);
  document.getElementById("download-results-button").addEventListener("click", downloadResults);

  grid = new Grid(gridConfig).render(document.getElementById("wrapper"));

  // Show all specifications when loading the page.
  const search = await pagefind.search(null);
  processSearchValue(search);

  const response2 = await fetch("./builder.json");
  const builder = await response2.json();
  document.getElementById("latest-run").innerText = dateFns.format(new Date(builder.dateTime), "yyyy-MM-dd kk:mm O");
});

/**
 * This method searches for the value in the specs, applies the filters to the found specs, and shows the specs on
 * the page.
 * @param {object} search - The object returned by pagefind.search().
 */
async function processSearchValue(search) {
  const results = await Promise.all(search.results.slice(0, 1000).map(r => r.data()));
  latestSpecsFromSearch = results;

  applyFiltersAndShowSpecs();
}

/**
 * This method applies the filters for status, action, and last updated, followed by showing the specs.
 */
function applyFiltersAndShowSpecs() {
  document.getElementById("filters-error-message").classList.add("d-none");
  document.getElementById("no-results-message").classList.add("d-none");

  const selectedActions = Array.from(document.querySelectorAll("#action-dropdown input"))
    .filter(input => input.checked)
    .map(input => input.value);

  const selectedStatuses = Array.from(document.querySelectorAll("#status-dropdown input"))
    .filter(input => input.checked)
    .map(input => input.value);

  let afterDate = document.getElementById("last-updated-after-date").value;

  if (afterDate) {
    if (dateFns.isMatch(afterDate, "yyyy-MM-dd")) {
      afterDate = new Date(afterDate);

      if (afterDate.toString() === "Invalid Date") {
        console.error("Invalid after date: " + document.getElementById("last-updated-after-date").value);
        document.querySelector("#filters-error-message .col").innerText = "Invalid value for \"Last updated after\".";
        document.getElementById("filters-error-message").classList.remove("d-none");
        return;
      }
    } else {
      console.error("Invalid after date format: " + afterDate);
      document.querySelector("#filters-error-message .col").innerText = "Invalid date format for \"Last updated after\".";
      document.getElementById("filters-error-message").classList.remove("d-none");
      return;
    }
  }

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

  showSpecs(filteredSpecs);
}

/**
 * This method show the spec on the page.
 * @param {Array} specs - An array of specs.
 */
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
      };
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

/**
 * This method downloads the visible specs as a CSV file.
 */
function downloadResults() {
  const data = shownSpecs.map(spec => {
    return {
      title: spec.meta.title,
      description: spec.meta.description,
      url: spec.url,
      lastUpdated: spec.meta["Last updated"],
      actions: spec.filters.Action.join(", "),
      status: spec.filters.status.join(", ")
    };
  });

  csvStringify.stringify(data, {
    header: true
  }, (err, output) => {
    console.log(output);
    download(output, "text/csv", "specs.csv");
  });
}

/**
 * This method offers content for download to the user.
 * @param {string} content - The content that should be downloaded.
 * @param {string} mimeType - The mime type of the content.
 * @param {string} filename - The default filename that the file should have when the user downloads it.
 */
function download(content, mimeType, filename) {
  const a = document.createElement("a"); // Create "a" element
  const blob = new Blob([content], {type: mimeType}); // Create a blob (file-like object)
  const url = URL.createObjectURL(blob); // Create an object URL from blob
  a.setAttribute("href", url); // Set "a" element link
  a.setAttribute("download", filename); // Set download filename
  a.click(); // Start downloading
}

/**
 * This function compares two dates.
 * @param {string} a - The first date.
 * @param {string} b - The second date.
 * @returns {number} - Either -1, 0, or 1.
 */
function compareLastUpdated(a, b) {
  if (!a) {
    return 1;
  }

  if (!b) {
    return -1;
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

/**
 * This function compares two descriptions.
 * @param {string} a - The first description.
 * @param {string} b - The second description.
 * @returns {number} - Either -1, 0, 1.
 */
function compareDescription(a, b) {
  if (!a) {
    return 1;
  }

  if (!b) {
    return -1;
  }

  if (a < b) {
    return -1;
  } else if (a > b) {
    return 1;
  } else {
    return 0;
  }
}

/**
 * This function returns the highest action of an array of actions.
 * @param {Array} actions -.
 * @returns {string} - The highest action.
 */
function getHighestAction(actions) {
  if (actions.includes("Lead")) {
    return "Lead";
  } else if (actions.includes("Create")) {
    return "Create";
  } else if (actions.includes("Contribute")) {
    return "Contribute";
  } else {
    return "Endorse";
  }
}

/**
 * This function returns a new function that waits to execute a function until a given delay has passed.
 * If the returned function is called before the delay has passed, the timer resets.
 * @param {Function} originalFn - The function that should be called once the delay has passed.
 * @param {number} delay - The delay in milliseconds.
 * @returns {(function(): void)|*} - The new function that takes into account the delay.
 */
function debounce(originalFn, delay ) {
  let timeout;
  return function() {
    clearTimeout(timeout);
    timeout = setTimeout(originalFn, delay);
  };
}
