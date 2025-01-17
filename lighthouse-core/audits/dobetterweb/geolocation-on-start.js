/**
 * @license Copyright 2016 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

/**
 * @fileoverview Audits a page to see if it is requesting the geolocation API on
 * page load. This is often a sign of poor user experience because it lacks context.
 */

'use strict';

const ViolationAudit = require('../violation-audit.js');

class GeolocationOnStart extends ViolationAudit {
  /**
   * @return {LH.Audit.Meta}
   */
  static get meta() {
    return {
      id: 'geolocation-on-start',
      title: '避免在页面加载时请求地理位置权限',
      failureTitle: '在页面加载时请求地理位置权限',
      description: '页面在加载时自动请求用户位置会使用户不信任页面或感到困惑,应将此请求交给用户主动触发. ' +
          '[Learn more](https://developers.google.com/web/tools/lighthouse/audits/geolocation-on-load).',
      requiredArtifacts: ['ConsoleMessages'],
    };
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @return {LH.Audit.Product}
   */
  static audit(artifacts) {
    // 'Only request geolocation information in response to a user gesture.'
    const results = ViolationAudit.getViolationResults(artifacts, /geolocation/);

    /** @type {LH.Audit.Details.Table['headings']} */
    const headings = [
      {key: 'url', itemType: 'url', text: 'URL'},
      {key: 'label', itemType: 'text', text: 'Location'},
    ];
    // TODO(bckenny): there should actually be a ts error here. results[0].stackTrace
    // should violate the results type. Shouldn't be removed from details items regardless.
    const details = ViolationAudit.makeTableDetails(headings, results);

    return {
      score: Number(results.length === 0),
      extendedInfo: {
        value: results,
      },
      details,
    };
  }
}

module.exports = GeolocationOnStart;
