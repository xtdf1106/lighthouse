/**
 * @license Copyright 2016 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Audit = require('./audit.js');
const URL = require('../lib/url-shim.js');
const Util = require('../report/html/renderer/util.js');
const NetworkRecords = require('../computed/network-records.js');

const SECURE_SCHEMES = ['data', 'https', 'wss', 'blob', 'chrome', 'chrome-extension', 'about'];
const SECURE_DOMAINS = ['localhost', '127.0.0.1'];

class HTTPS extends Audit {
  /**
   * @return {LH.Audit.Meta}
   */
  static get meta() {
    return {
      id: 'is-on-https',
      title: '使用HTTPS',
      failureTitle: '没有使用HTTPS',
      description: '所有站点都应该使用HTTPS保护，即使是那些不处理敏感数据的站点也是如此。 HTTPS可防止入侵者篡改或被动地监听您的应用与用户之间的通信，这是HTTP / 2和许多新的Web平台API的先决条件[Learn more](https://developers.google.com/web/tools/lighthouse/audits/https).',
      requiredArtifacts: ['devtoolsLogs'],
    };
  }

  /**
   * @param {{parsedURL: {scheme: string, host: string}, protocol: string}} record
   * @return {boolean}
   */
  static isSecureRecord(record) {
    return SECURE_SCHEMES.includes(record.parsedURL.scheme) ||
           SECURE_SCHEMES.includes(record.protocol) ||
           SECURE_DOMAINS.includes(record.parsedURL.host);
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @param {LH.Audit.Context} context
   * @return {Promise<LH.Audit.Product>}
   */
  static audit(artifacts, context) {
    const devtoolsLogs = artifacts.devtoolsLogs[Audit.DEFAULT_PASS];
    return NetworkRecords.request(devtoolsLogs, context).then(networkRecords => {
      const insecureURLs = networkRecords
          .filter(record => !HTTPS.isSecureRecord(record))
          .map(record => URL.elideDataURI(record.url));

      let displayValue = '';
      if (insecureURLs.length > 1) {
        displayValue = `${Util.formatNumber(insecureURLs.length)} insecure requests found`;
      } else if (insecureURLs.length === 1) {
        displayValue = `${insecureURLs.length} insecure request found`;
      }

      const items = Array.from(new Set(insecureURLs)).map(url => ({url}));

      /** @type {LH.Audit.Details.Table['headings']} */
      const headings = [
        {key: 'url', itemType: 'url', text: '不安全的URL'},
      ];

      return {
        score: Number(items.length === 0),
        displayValue,
        extendedInfo: {
          value: items,
        },
        details: Audit.makeTableDetails(headings, items),
      };
    });
  }
}

module.exports = HTTPS;
