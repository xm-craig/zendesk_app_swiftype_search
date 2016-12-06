(function() {

    return {
        BASE_URL: 'https://api.swiftype.com',

        defaultState: 'loading',

        events: {
            'app.created': 'init',
            '*.changed': 'handleChanged',
            'searchEngine.done': 'handleResults',
            'searchEngine.fail': 'handleFail',
            'click .suggestion': 'suggestionClicked',
            'click #search-submit': 'doTheSearch',
            'click .page-link': 'fetchPage',
            'keydown .search-box': 'handleKeydown',
            'requiredProperties.ready': 'loadSearchSuggestions'
        },

        requests: {
            getPage: function(params) {
              return {
                  url: params.pageUrl,
                  type: 'GET'
              };
            },

            searchEngine: function(params) {
                return this.searchRequest('/api/v1/public/engines/suggest.json', undefined, {
                    type: 'GET',
                    data: params
                });
            }

        },

        createUrl: function(url, parameters) {
          var base = this.BASE_URL;
          base = (base[base.length - 1] === '/') ? base.slice(0, -1) : base;
          url = (url[0] === '/') ? url.slice(1) : url;
          var full = [base, url].join('/');
          if (parameters) {
            full += '?' + _.map(parameters, function(value, key) {
              return [key, value].join('=');
            }).join('&');
          }
          return full;
        },
    
        searchRequest: function(url, parameters, options) {
          var ajax_options = _.extend(options || {}, {
                url: this.createUrl(url, parameters),
                dataType: 'json'
              });
    
          return ajax_options;
        },

        init: function(data) {
            this.hasActivated = true;
            this.currAttempt = 0;
            this.requiredProperties = [];

            if (this.currentLocation() == 'ticket_sidebar') {
                this.requiredProperties.push('ticket.id', 'ticket.subject');
            }

            _.defer((function() {
                this.switchTo('search');
                this.trigger('requiredProperties.ready');
            }).bind(this));
        },

        suggestionClicked: function(e) {
            var $searchBox = this.$('.search-box');
            $searchBox.val($searchBox.val() + ' ' + this.$(e.target).text());

            this.doTheSearch();

            return false;
        },

        searchConfig: function(options) {
            var $search = this.$('.search');
            var searchTerm = $search.find('.search-box').val();

            return _.extend(options || {}, {
                     "engine_key": this.settings.engine_key,
                     "q": searchTerm,
                     "per_page": this.settings.per_page
            });
        },

        doTheSearch: function() {
            this.$('.results').empty();
            this.$('.searching').show();

            this.ajax('searchEngine', this.searchConfig());
        },

        handleKeydown: function(e) {
            if (e.which === 13) {
                this.doTheSearch();
                return false;
            }
        },

        // fetch the contents of a remote page
        fetchPage: function(e) {
            e.preventDefault();
            this.$('.results').empty();
            this.$('.searching').show();

            var pageNum = this.$(e.currentTarget).data('url');
            this.ajax('searchEngine', this.searchConfig({page: pageNum}));
        },

        // handle search results
        handleResults: function(results) {
            var app = this;
            var data = {
                record_count: results.record_count,
                records: {},
                info: results.info,
                errors: results.errors
            };
            data.count = this.I18n.t('search.results', {count: results.info.page.total_result_count});
            data.info.page.is_paged = (data.info.page.num_pages > 1) ? true : false;
            // determine current page number
            if(data.info.page.is_paged) {
              if (data.info.page.current_page > 1) {
                data.info.page.previous_page = data.info.page.current_page - 1;
              }
              if (data.info.page.current_page < data.info.page.num_pages) {
                data.info.page.next_page = data.info.page.current_page + 1;
              }
            }

            data.records.page = _.map(results.records.page, function(page) {
                return { url: page.url, title: page[app.settings.title_property], type: page[app.settings.type_property]};
            });

            var resultsTemplate = this.renderTemplate('results', data);
            this.$('.searching').hide();
            this.$('.results').html(resultsTemplate);
        },

        handleChanged: _.debounce(function(property) {
            // test if change event fired before app.activated
            if (!this.hasActivated) {
                return;
            }

            if (property.propertyName === 'ticket.subject') {
                this.loadSearchSuggestions();
            }
        }, 500),

        loadSearchSuggestions: function() {
            var searchSuggestions = [],
                ticketSubject = this.ticket().subject(),
                suggestionsTemplate = "",
                keywords = "";

            if (this.settings.enable_suggestions && ticketSubject) {
                keywords = this.extractKeywords(ticketSubject);
                searchSuggestions.push.apply(searchSuggestions, keywords);
            }

            suggestionsTemplate = this.renderTemplate('suggestions', {
                searchSuggestions: searchSuggestions
            });
            this.$('.suggestions').html(suggestionsTemplate);
        },


        extractKeywords: function(text) {
            // strip punctuation and extra spaces
            text = text.toLowerCase().replace(/[\.,-\/#!$?%\^&\*;:{}=\-_`~()]/g, "").replace(/\s{2,}/g, " ");

            // split by spaces
            var words = text.split(" "),
                exclusions = this.I18n.t('stopwords.exclusions').split(","),
                keywords = _.difference(words, exclusions);

            return keywords;
        },

        handleFail: function(data) {
            var response = JSON.parse(data.responseText);
            var message = "";

            if (response.error) {
                message = this.I18n.t("global.error.%@".fmt(response.error));
            } else if (response.description) {
                message = response.description;
            } else {
                message = this.I18n.t('global.error.message');
            }

            var error = {
                title: this.I18n.t('global.error.title'),
                message: message
            };

            var errorTemplate = this.renderTemplate('error', error);

            this.$('.searching').hide();
            this.$('.results').html(errorTemplate);
        },

        showError: function(title, msg) {
            this.switchTo('error', {
                title: title || this.I18n.t('global.error.title'),
                message: msg || this.I18n.t('global.error.message')
            });
        },

        _safeGetPath: function(propertyPath) {
            return _.inject(propertyPath.split('.'), function(context, segment) {
                if (context == null) {
                    return context;
                }
                var obj = context[segment];
                if (_.isFunction(obj)) {
                    obj = obj.call(context);
                }
                return obj;
            }, this);
        },

        _validateRequiredProperty: function(propertyPath) {
            var value = this._safeGetPath(propertyPath);
            return value != null && value !== '' && value !== 'no';
        },

        _getUrlParams: function(url) {
            var queryString = url.substring(url.indexOf('?') + 1) || "",
                keyValPairs = [],
                params = {};

            if (queryString.length) {
                keyValPairs = queryString.split('&');
                for (var pairNum = 0; pairNum < keyValPairs.length; pairNum++) {
                    var key = keyValPairs[pairNum].split('=')[0];
                    params[key] = (keyValPairs[pairNum].split('=')[1]);
                }
            }

            return params;
        }

    };

}());
