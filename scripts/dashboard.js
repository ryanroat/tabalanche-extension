/* global platform tabalanche cre */

var tabGroupContainer = document.getElementById('tab-groups');

var tabGroupData = new Map();

var templateTabIcon = cre('img.tabicon');
var templateTabLink = cre('a.tablink');
var templateTabListItem = cre('li.tablist-item');
var templateTabStash = cre('div.tabgroup.tabstash');
var templateFlap = cre('div.flap');
var templateTabList = cre('ul.tablist');

function getElementIndex(node) {
  var i = 0;
  while (node = node.previousElementSibling) ++i;
  return i;
}

function tabCountString(num) {
  return num + (num == 1 ? ' tab' : ' tabs');
}

// blame http://stackoverflow.com/q/20087368
function getLinkClickType(evt) {
  // Technically the click event is only supposed to fire for button 0,
  // but WebKit has shipped it for middle-click (button 1) for years.
  // See http://specifiction.org/t/fixing-the-click-event-in-browsers/933
  if (evt.button == 1 ||
    evt.button === 0 && (evt.ctrlKey || evt.shiftKey || evt.metaKey)) {
    return 'new';

  // If the primary button triggered the click with no modifier keys
  } else if (evt.button === 0) {
    return 'visit';

  // We are *really* not supposed to get here
  } else {
    return 'other';
  }
}

function createTabGroupDiv(tabGroupDoc) {
  var pendingPutPromise = null;
  var pendingPutIsStale = false;

  function updateTabGroup() {
    function putNewTabGroupDoc() {
      pendingPutIsStale = false;
      return tabalanche.getDB().then(function(db) {
        var action = tabGroupDoc.tabs.length > 0 ? 'put' : 'remove';
        return db[action](tabGroupDoc).then(function (result) {
          tabGroupDoc._rev = result.rev;
          if (pendingPutIsStale) {
            return putNewTabGroupDoc();
          } else {
            pendingPutPromise = null;
          }
        }, function(err) {
          if (err.name == 'conflict') {
            return db.get(tabGroupDoc._id)
            .then(function(newDoc) {
              tabGroupDoc._rev = newDoc._rev;
              return putNewTabGroupDoc();
            });
          }
        });
      });
    }

    if (!pendingPutPromise) {
      pendingPutPromise = putNewTabGroupDoc();
    } else pendingPutIsStale = true;
    return pendingPutPromise;
  }

  var container;
  var tabCount = cre('span', [tabCountString(tabGroupDoc.tabs.length)]);

  function createTabListItem(tab) {
    var tabIcon = cre(templateTabIcon,
      {src: tab.icon || platform.faviconPath(tab.url)});

    var tabLink = cre(templateTabLink, {href: tab.url},
      [tabIcon, tab.title]);

    var listItem = cre(templateTabListItem, [tabLink]);

    tabLink.addEventListener('click', function(evt) {
      var type = getLinkClickType(evt);

      // we have a special behavior for normal-visiting
      if (type == 'visit') {
        platform.openBackgroundTab(tab.url);

        // We could technically do this stuff in a callback that only fires
        // once the background tab is opened, but then we'd run into issues
        // with the link getting clicked twice, or the tab group getting
        // updated before the link gets removed, or a bunch of issues it's
        // better to just not have to deal with.
        tabGroupDoc.tabs.splice(getElementIndex(listItem), 1);
        if (tabGroupDoc.tabs.length == 0) {
          container.remove();
        } else {
          listItem.remove();
          tabCount.textContent = tabCountString(tabGroupDoc.tabs.length);
        }
        updateTabGroup();

        evt.preventDefault();
      }
    });

    return listItem;
  }

  var tabListItems = tabGroupDoc.tabs.map(createTabListItem);

  var nameString = tabGroupDoc.name ||
    new Date(tabGroupDoc.created).toLocaleString();

  var className = tabGroupDoc.name ? 'explicit-name' : 'implicit-name';

  var name = cre('h3', {className: className}, [nameString]);
  var details = cre('h4', [tabCount]);
  var hgroup = cre('hgroup', [name, details]);
  var flap = cre(templateFlap, [hgroup]);
  var list = cre(templateTabList, tabListItems);

  container = cre(templateTabStash, [flap, list]);

  tabGroupContainer.appendChild(container);
  tabGroupData.set(tabGroupDoc._id, {
    doc: tabGroupDoc,
    container: container,
    list: list,
    count: tabCount,
    name: name
  });
}

var lastTabGroup;
var loadingTabGroups = false;
var allTabGroupsLoaded = false;

function capTabGroupLoading() {
  allTabGroupsLoaded = true;
  // we can stop listening to load on scroll
  document.removeEventListener('scroll', loadMoreIfNearBottom);
  // TODO: set the "Loading..." message to be "No older tab groups"
  // or a message stating there are *no* tab groups
}

function showLoadedTabGroups(tabGroups) {
  loadingTabGroups = false;
  for (var i = 0; i < tabGroups.length; i++) {
    createTabGroupDiv(tabGroups[i]);
  }
  if (tabGroups.length > 0) {
    lastTabGroup = tabGroups[tabGroups.length-1];
    // in case there's still visible window, recurse
    return loadMoreIfNearBottom();
  } else {
    return capTabGroupLoading();
  }
}

function loadMoreTabGroups() {
  if (!loadingTabGroups && !allTabGroupsLoaded) {
    loadingTabGroups = true;

    // TODO: Set "Loading..." message
    // (which could technically always be visible)

    // Get the next groups
    tabalanche.getSomeTabGroups([lastTabGroup.created, lastTabGroup._id])
      .then(showLoadedTabGroups);
  }
}

// Get the first groups
tabalanche.getSomeTabGroups().then(showLoadedTabGroups);

// How many window-heights from the bottom of the page we should be before
// loading more tabs.
var loadMoreMargin = 1/2;

function loadMoreIfNearBottom() {
  var bottomOffset = window.innerHeight * (1 + loadMoreMargin);
  var scrollTop = window.scrollY;
  var scrollHeight = document.documentElement.scrollHeight;

  if (scrollTop + bottomOffset >= scrollHeight) {
    loadMoreTabGroups();
  }
}

document.addEventListener('scroll', loadMoreIfNearBottom);

var optslink = document.getElementById('options');

// Set href so this link works mostly like the others
optslink.href = platform.getOptionsURL();

// Perform platform-specific options opening on click anyway
optslink.addEventListener('click', function(evt) {
  platform.openOptionsPage();
  evt.preventDefault();
});
