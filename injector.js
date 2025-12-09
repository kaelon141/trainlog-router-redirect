(() => {
    const script = document.createElement('script');
    script.setAttribute('src', chrome.runtime.getURL('router-request-patch.js'));
    script.setAttribute('type', 'text/javascript')
    script.async = false;
    (document.documentElement || document.head).append(script);
})()