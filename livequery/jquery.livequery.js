/*! Copyright (c) 2014 Brandon Aaron (http://brandonaaron.net)
 * Licensed under the MIT License (LICENSE.txt)
 */

(function (factory) {
    if ( typeof define === 'function' && define.amd ) {
        // AMD. Register as an anonymous module.
        define(['jquery'], factory);
    } else if (typeof exports === 'object') {
        // Node/CommonJS style for Browserify
        module.exports = factory;
    } else {
        // Browser globals
        factory(jQuery);
    }
}(function ($) {

    $.extend($.fn, {
        livequery: function(selector, matchedFn, unmatchedFn) {
          var q = $.livequery.findorcreate(this, selector, matchedFn, unmatchedFn);
          q.run();
          return this;
        },
        expire: function(selector, matchedFn, unmatchedFn) {
          var q = $.livequery.find(this, selector, matchedFn, unmatchedFn);
          if (q) {
            q.stop();
          }
          return this;
        }
      });
  
      var $findLengthFallback = function (selector, node) {
        if (!node) {
          return [];
        }
  
        var nodeType = node.nodeType;
        if (nodeType === 1 || nodeType === 9 || nodeType === 11) {
          try {
            return Array.from(node.querySelectorAll(selector));
          } catch(e) {
            console.error('$findLengthFallback exception: ' + e.message + ': ' + e.stack);
            return $.find(selector, node);
          }
        }
      
        return [];
      };
  
      $.livequery = function(jq, selector, matchedFn, unmatchedFn) {
        this.selector = selector;
        this.jq = jq;
        this.context = jq.context;
        this.matchedFn = matchedFn;
        this.unmatchedFn = unmatchedFn;
        this.stopped = false;
        this.id = $.livequery.queries.push(this) - 1;
  
        matchedFn.$lqguid = matchedFn.$lqguid || $.livequery.guid++;
        if (unmatchedFn) {
          unmatchedFn.$lqguid = unmatchedFn.$lqguid || $.livequery.guid++;
        }
      };
      $.livequery.prototype = {
        run: function() {
          if ($.livequery.prepared !== true || this.stopped === true) {
            return;
          }
          this.stopped = false;
          this.jq.find(this.selector).each($.proxy(function(i, element) {
            this.added(element);
          }, this));
        },
        stop: function() {
          this.jq.find(this.selector).each($.proxy(function(i, element) {
            this.removed(element);
          }, this));
          this.stopped = true;
        },
        matches: function(element) {
          var matches;
  
          //https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType
          if (element.nodeType === 1) {
            matches = !this.isStopped() && this.jq[0].contains(element) && ($.find.matchesSelector(element, this.selector) || $findLengthFallback(this.selector, element).length);
          } else {
            matches = false;
          }
  
          return matches;
        },
        added: function(element) {
          if (!this.isStopped() && !this.isMatched(element)) {
            this.markAsMatched(element);
            this.matchedFn.call(element, element);
          }
        },
        removed: function(element) {
          if (!this.isStopped() && this.isMatched(element)) {
            this.removeMatchedMark(element);
            if (this.unmatchedFn) {
              this.unmatchedFn.call(element, element);
            }
          }
        },
        getLQArray: function(element) {
          var arr = $.data(element, $.livequery.key) || [],
            index = $.inArray(this.id, arr);
          arr.index = index;
          return arr;
        },
        markAsMatched: function(element) {
          var arr = this.getLQArray(element);
          if (arr.index === -1) {
            arr.push(this.id);
            $.data(element, $.livequery.key, arr);
          }
        },
        removeMatchedMark: function(element) {
          var arr = this.getLQArray(element);
          if (arr.index > -1) {
            arr.splice(arr.index, 1);
            $.data(element, $.livequery.key, arr);
          }
        },
        isMatched: function(element) {
          //performance reasons, avoid find if first part succeeds
          return this.getLQArray(element).index !== -1 || $findLengthFallback(this.selector, element).some(function(element) {
            return this.getLQArray(element).index !== -1;
          }, this);
        },
        isStopped: function() {
          return this.stopped === true;
        }
      };
  
      $.extend($.livequery, {
        version: '2.0.0-pre',
        guid: 0,
        queries: [],
        watchAttributes: false,
        attributeFilter: [],
        setup: false,
        timeout: null,
        method: 'none',
        prepared: false,
        key: 'livequery',
        htcPath: false,
        prepare: {
          mutationobserver: function() {
            var observer = new MutationObserver($.livequery.handle.mutationobserver);
            observer.observe(document, {
              childList: true,
              attributes: $.livequery.watchAttributes,
              subtree: true
              //attributeFilter: $.livequery.attributeFilter
            });
            $.livequery.prepare.both();
          },
          loop: function() {
            var matchedElements = [];
  
            setInterval(function() {
              //scan for removed elements
              matchedElements.forEach(function(element) {
                //ie8 does not have document.contains - document.body is present
                if (!document.body.contains(element)) {
                  matchedElements.splice(matchedElements.indexOf(element), 1);
                  $.livequery.handle.removed(element);
                }
              });
              //scan for added elements
              $.livequery.queries.forEach(function(query) {
                $findLengthFallback(query.selector, query.jq[0]).forEach(function(element) {
                  if (matchedElements.indexOf(element) < 0) {
                    matchedElements.push(element);
                    $.livequery.handle.added(element);
                  }
                });
              });
            }, 1000);
            $.livequery.prepare.both();
          },
          both: function() {
            $.livequery.prepared = true;
            $.each($.livequery.queries, function(i, query) {
              query.run();
            });
          }
        },
        handle: {
          added: function(target) {
            $.livequery.queries.filter(function(query) {
              return query.matches(target);
            }).forEach(function(query) {
              if ($.find.matchesSelector(target, query.selector)) {
                setTimeout(function() {
                  query.added(target);
                }, 1);
              }
  
              $findLengthFallback(query.selector, target).forEach(function(element) {
                setTimeout(function() {
                  query.added(element);
                }, 1);
              });
            });
          },
          removed: function(target) {
            function onElementRemoved(element, query) {
              setTimeout(function() {
                query.removed(element);
                //remove all queries that this element had if any
                $.livequery.queries = $.livequery.queries.filter(function(query) {
                  return element !== query.jq[0];
                });
              }, 1);
            }
  
            $.livequery.queries.filter(function(query) {
              return query.isMatched(target);
            }).forEach(function(query) {
              if ($.find.matchesSelector(target, query.selector)) {
                onElementRemoved(target, query);
              } else {
                $findLengthFallback(query.selector, target).forEach(function(element) {
                  onElementRemoved(element, query);
                });
              }
            });
          },
          modified: function(target) {
            $.each($.livequery.queries, function(i, query) {
              if (query.isMatched(target)) {
                if (!query.matches(target)) {
                  query.removed(target);
                }
              } else {
                if (query.matches(target)) {
                  query.added(target);
                }
              }
            });
          },
          mutationobserver: function(mutations) {
            $.each(mutations, function(index, mutation) {
              if (mutation.type === 'attributes') {
                $.livequery.handle.modified(mutation.target);
              } else {
                $.each(['added', 'removed'], function(i, type) {
                  $.each(mutation[type + 'Nodes'], function(i, element) {
                    $.livequery.handle[type](element);
                  });
                });
              }
            });
          }
        },
        find: function(jq, selector, matchedFn, unmatchedFn) {
          var q;
          $.each($.livequery.queries, function(i, query) {
            if (selector === query.selector && jq === query.jq &&
              (!matchedFn || matchedFn.$lqguid === query.matchedFn.$lqguid) &&
              (!unmatchedFn || unmatchedFn.$lqguid === query.unmatchedFn.$lqguid)) {
              return (q = query) && false;
            }
          });
          return q;
        },
        findorcreate: function(jq, selector, matchedFn, unmatchedFn) {
          return $.livequery.find(jq, selector, matchedFn, unmatchedFn) ||
            new $.livequery(jq, selector, matchedFn, unmatchedFn);
        }
      });

    $(function() {
        if ('MutationObserver' in window) {
            $.livequery.method = 'mutationobserver';
        } else if ('MutationEvent' in window) {
            $.livequery.method = 'mutationevent';
        } else if ('behavior' in document.documentElement.currentStyle) {
            $.livequery.method = 'iebehaviors';
        }

        if ($.livequery.method) {
            $.livequery.prepare[$.livequery.method]();
        } else {
            throw new Error('Could not find a means to monitor the DOM');
        }
    });

}));
