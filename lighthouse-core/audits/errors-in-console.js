/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/**
 * @fileoverview Audits a page to determine whether it contains console errors.
 * This is done by collecting Chrome console log messages and filtering out the non-error ones.
 */

const Audit = require('./audit.js');

class ErrorLogs extends Audit {
  /**
   * @return {LH.Audit.Meta}
   */
  static get meta() {
    return {
      id: 'errors-in-console',
      title: '没有浏览器错误记录到控制台',
      description: '记录到控制台的错误表明未解决的问题。 它们可能来自网络请求失败和其他浏览器问题',
      failureTitle: '浏览器错误已记录到控制台',
      requiredArtifacts: ['ConsoleMessages', 'RuntimeExceptions'],
    };
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @return {LH.Audit.Product}
   */
  static audit(artifacts) {
    const consoleEntries = artifacts.ConsoleMessages;
    const runtimeExceptions = artifacts.RuntimeExceptions;
    /** @type {Array<{source: string, description: string|undefined, url: string|undefined}>} */
    const consoleRows =
      consoleEntries.filter(log => log.entry && log.entry.level === 'error')
      .map(item => {
        return {
          source: item.entry.source,
          description: item.entry.text,
          url: item.entry.url,
        };
      });

    const runtimeExRows =
      runtimeExceptions.filter(entry => entry.exceptionDetails !== undefined)
      .map(entry => {
        const description = entry.exceptionDetails.exception ?
          entry.exceptionDetails.exception.description : entry.exceptionDetails.text;

        return {
          source: 'Runtime.exception',
          description,
          url: entry.exceptionDetails.url,
        };
      });

    const tableRows = consoleRows.concat(runtimeExRows);

    /** @type {LH.Audit.Details.Table['headings']} */
    const headings = [
      {key: 'url', itemType: 'url', text: 'URL'},
      {key: 'description', itemType: 'code', text: 'Description'},
    ];

    const details = Audit.makeTableDetails(headings, tableRows);
    const numErrors = tableRows.length;

    return {
      score: Number(numErrors === 0),
      numericValue: numErrors,
      details,
    };
  }
}

module.exports = ErrorLogs;
