/**
 * @license Copyright 2016 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

/**
 * @fileoverview Audits a page to see if it is requesting usage of the notification API on
 * page load. This is often a sign of poor user experience because it lacks context.
 */

'use strict';

const ViolationAudit = require('../violation-audit.js');

class NotificationOnStart extends ViolationAudit {
  /**
   * @return {LH.Audit.Meta}
   */
  static get meta() {
    return {
      id: 'notification-on-start',
      title: '避免在页面加载时请求通知权限',
      failureTitle: '在页面加载时请求通知权限',
      description: '用户对请求在没有上下文的情况下发送通知的站点不信任或混淆.应将此请求交给用户主动触发 ' +
          'instead. [Learn more](https://developers.google.com/web/tools/lighthouse/audits/notifications-on-load).',
      requiredArtifacts: ['ConsoleMessages'],
    };
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @return {LH.Audit.Product}
   */
  static audit(artifacts) {
    const results = ViolationAudit.getViolationResults(artifacts, /notification permission/);

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

module.exports = NotificationOnStart;
