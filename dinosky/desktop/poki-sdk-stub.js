(function attachPokiStub(globalScope) {
  if (globalScope.PokiSDK) return;

  function resolved(value) {
    return Promise.resolve(value);
  }

  const PokiSDK = {
    init: function init() {
      return resolved();
    },
    login: function login() {
      return Promise.reject(new Error('Poki accounts are not available in the desktop build.'));
    },
    getUser: function getUser() {
      return resolved(null);
    },
    getToken: function getToken() {
      return resolved(null);
    },
    gameLoadingStart: function gameLoadingStart() {},
    gameLoadingFinished: function gameLoadingFinished() {},
    gameplayStart: function gameplayStart() {},
    gameplayStop: function gameplayStop() {},
    commercialBreak: function commercialBreak() {
      return resolved();
    },
    rewardedBreak: function rewardedBreak() {
      return resolved(false);
    },
    displayAd: function displayAd() {
      return resolved();
    },
    getURLParam: function getURLParam() {
      return null;
    }
  };

  globalScope.PokiSDK = PokiSDK;
})(typeof window !== 'undefined' ? window : globalThis);
