/**
 * @license Copyright 2016 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

/**
 * @fileoverview Audit a page to see if it is using passive event listeners on
 * scroll-blocking touch and wheel event listeners.
 */

'use strict';

const ViolationAudit = require('../violation-audit.js');

class PassiveEventsAudit extends ViolationAudit {
  /**
   * @return {LH.Audit.Meta}
   */
  static get meta() {
    return {
      id: 'uses-passive-event-listeners',
      title: '使用被动侦听器来提高滚动性能',
      failureTitle: '没有使用被动侦听器来提高滚动性能',
      description: '考虑将触摸和滚轮事件监听器标记为“被动”以提高页面的滚动性能 [Learn more](https://developers.google.com/web/tools/lighthouse/audits/passive-event-listeners).',
      requiredArtifacts: ['ConsoleMessages'],
    };
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @return {LH.Audit.Product}
   */
  static audit(artifacts) {
    const results = ViolationAudit.getViolationResults(artifacts, /passive event listener/);

    /** @type {LH.Audit.Details.Table['headings']} */
    const headings = [
      {key: 'url', itemType: 'url', text: 'URL'},
      {key: 'label', itemType: 'text', text: 'Location'},
    ];
    // TODO(bckenny): see TODO in geolocation-on-start
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

module.exports = PassiveEventsAudit;
