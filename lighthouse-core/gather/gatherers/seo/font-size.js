/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/**
 * @fileoverview Extracts information about illegible text from the page.
 *
 * In effort to keep this audit's execution time around 1s, maximum number of protocol calls was limited.
 * Firstly, number of visited nodes (text nodes for which font size was checked) is capped.
 * Secondly, number of failing nodes that are analyzed (for which detailed CSS information is extracted) is also limited.
 *
 * The applicable CSS rule is also determined by the code here with some simplifications (namely !important is ignored).
 * This gatherer collects stylesheet metadata by itself, instead of relying on the styles gatherer which is slow (because it parses the stylesheet content).
 */

const Gatherer = require('../gatherer');
const FONT_SIZE_PROPERTY_NAME = 'font-size';
const TEXT_NODE_BLOCK_LIST = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
const MINIMAL_LEGIBLE_FONT_SIZE_PX = 12;
// limit number of protocol calls to make sure that gatherer doesn't take more than 1-2s
const MAX_NODES_SOURCE_RULE_FETCHED = 50; // number of nodes to fetch the source font-size rule

/** DevTools uses a numeric enum for nodeType */
const TEXT_NODE_TYPE = 3;

/** @typedef {import('../../driver.js')} Driver */
/** @typedef {LH.Artifacts.FontSize['analyzedFailingNodesData'][0]} NodeFontData */
/** @typedef {LH.Artifacts.FontSize.DomNodeMaybeWithParent} DomNodeMaybeWithParent*/

/**
 * @param {LH.Artifacts.FontSize.DomNodeMaybeWithParent=} node
 * @returns {node is LH.Artifacts.FontSize.DomNodeWithParent}
 */
function nodeInBody(node) {
  if (!node) {
    return false;
  }
  if (node.nodeName === 'BODY') {
    return true;
  }
  return nodeInBody(node.parentNode);
}

/**
 * Get list of all nodes from the document body.
 *
 * @param {Driver} driver
 * @returns {Promise<Array<LH.Artifacts.FontSize.DomNodeWithParent>>}
 */
async function getAllNodesFromBody(driver) {
  const nodes = /** @type {DomNodeMaybeWithParent[]} */ (await driver.getNodesInDocument());
  /** @type {Map<number|undefined, LH.Artifacts.FontSize.DomNodeMaybeWithParent>} */
  const nodeMap = new Map();
  nodes.forEach(node => nodeMap.set(node.nodeId, node));
  nodes.forEach(node => (node.parentNode = nodeMap.get(node.parentId)));
  return nodes.filter(nodeInBody);
}

/**
 * @param {LH.Crdp.CSS.CSSStyle} [style]
 * @return {boolean}
 */
function hasFontSizeDeclaration(style) {
  return !!style && !!style.cssProperties.find(({name}) => name === FONT_SIZE_PROPERTY_NAME);
}

/**
 * Computes the CSS specificity of a given selector, i.e. #id > .class > div
 * LIMITATION: !important is not respected
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/Specificity
 * @see https://www.smashingmagazine.com/2010/04/css-specificity-and-inheritance/
 *
 * @param {string} selector
 * @return {number}
 */
function computeSelectorSpecificity(selector) {
  const tokens = selector.split(' ');

  let numIDs = 0;
  let numClasses = 0;
  let numTypes = 0;

  for (const token of tokens) {
    const ids = token.match(/\b#[a-z0-9]+/g) || [];
    const classes = token.match(/\b\.[a-z0-9]+/g) || [];
    const types = token.match(/^[a-z]+/) ? [1] : [];
    numIDs += ids.length;
    numClasses += classes.length;
    numTypes += types.length;
  }

  return Math.min(9, numIDs) * 100 + Math.min(9, numClasses) * 10 + Math.min(9, numTypes);
}

/**
 * Finds the most specific directly matched CSS font-size rule from the list.
 *
 * @param {Array<LH.Crdp.CSS.RuleMatch>} [matchedCSSRules]
 * @returns {NodeFontData['cssRule']|undefined}
 */
function findMostSpecificMatchedCSSRule(matchedCSSRules = []) {
  let maxSpecificity = -Infinity;
  /** @type {LH.Crdp.CSS.CSSRule|undefined} */
  let maxSpecificityRule;

  for (const {rule, matchingSelectors} of matchedCSSRules) {
    if (hasFontSizeDeclaration(rule.style)) {
      const specificities = matchingSelectors.map(idx =>
        computeSelectorSpecificity(rule.selectorList.selectors[idx].text)
      );
      const specificity = Math.max(...specificities);
      // Use greater OR EQUAL so that the last rule wins in the event of a tie
      if (specificity >= maxSpecificity) {
        maxSpecificity = specificity;
        maxSpecificityRule = rule;
      }
    }
  }

  if (maxSpecificityRule) {
    return {
      type: 'Regular',
      ...maxSpecificityRule.style,
      parentRule: {
        origin: maxSpecificityRule.origin,
        selectors: maxSpecificityRule.selectorList.selectors,
      },
    };
  }
}

/**
 * Finds the most specific directly matched CSS font-size rule from the list.
 *
 * @param {Array<LH.Crdp.CSS.InheritedStyleEntry>} [inheritedEntries]
 * @returns {NodeFontData['cssRule']|undefined}
 */
function findInheritedCSSRule(inheritedEntries = []) {
  // The inherited array contains the array of matched rules for all parents in ascending tree order.
  // i.e. for an element whose path is `html > body > #main > #nav > p`
  // `inherited` will be an array of styles like `[#nav, #main, body, html]`
  // The closest parent with font-size will win
  for (const {inlineStyle, matchedCSSRules} of inheritedEntries) {
    if (hasFontSizeDeclaration(inlineStyle)) return {type: 'Inline', ...inlineStyle};

    const directRule = findMostSpecificMatchedCSSRule(matchedCSSRules);
    if (directRule) return directRule;
  }
}

/**
 * Returns the governing/winning CSS font-size rule for the set of styles given.
 * This is roughly a stripped down version of the CSSMatchedStyle class in DevTools.
 *
 * @see https://cs.chromium.org/chromium/src/third_party/blink/renderer/devtools/front_end/sdk/CSSMatchedStyles.js?q=CSSMatchedStyles+f:devtools+-f:out&sq=package:chromium&dr=C&l=59-134
 * @param {LH.Crdp.CSS.GetMatchedStylesForNodeResponse} matched CSS rules
 * @returns {NodeFontData['cssRule']|undefined}
 */
function getEffectiveFontRule({inlineStyle, matchedCSSRules, inherited}) {
  // Inline styles have highest priority
  if (hasFontSizeDeclaration(inlineStyle)) return {type: 'Inline', ...inlineStyle};

  // Rules directly referencing the node come next
  const matchedRule = findMostSpecificMatchedCSSRule(matchedCSSRules);
  if (matchedRule) return matchedRule;

  // Finally, find an inherited property if there is one
  const inheritedRule = findInheritedCSSRule(inherited);
  if (inheritedRule) return inheritedRule;

  return undefined;
}

/**
 * @param {string} nodeValue
 * @returns {number}
 */
function getNodeTextLength(nodeValue) {
  return !nodeValue ? 0 : nodeValue.trim().length;
}

/**
 * @param {Driver} driver
 * @param {LH.Crdp.DOM.Node} node text node
 * @returns {Promise<NodeFontData['cssRule']|undefined>}
 */
async function fetchSourceRule(driver, node) {
  const matchedRules = await driver.sendCommand('CSS.getMatchedStylesForNode', {
    nodeId: node.nodeId,
  });
  const sourceRule = getEffectiveFontRule(matchedRules);
  if (!sourceRule) return undefined;

  return {
    type: sourceRule.type,
    range: sourceRule.range,
    styleSheetId: sourceRule.styleSheetId,
    parentRule: sourceRule.parentRule && {
      origin: sourceRule.parentRule.origin,
      selectors: sourceRule.parentRule.selectors,
    },
  };
}

/**
 * @param {{nodeType: number, nodeValue: string, parentNodeName: string}} node
 * @returns {boolean}
 */
function isNonEmptyTextNode(node) {
  return (
    node.nodeType === TEXT_NODE_TYPE &&
    !TEXT_NODE_BLOCK_LIST.has(node.parentNodeName) &&
    getNodeTextLength(node.nodeValue) > 0
  );
}

class FontSize extends Gatherer {
  /**
   * @param {LH.Gatherer.PassContext['driver']} driver
   * @param {Array<NodeFontData>} failingNodes
   */
  static async fetchFailingNodeSourceRules(driver, failingNodes) {
    const analysisPromises = failingNodes
      .sort((a, b) => b.textLength - a.textLength)
      .slice(0, MAX_NODES_SOURCE_RULE_FETCHED)
      .map(async failingNode => {
        failingNode.cssRule = await fetchSourceRule(driver, failingNode.node);
        return failingNode;
      });

    const analyzedFailingNodesData = await Promise.all(analysisPromises);

    const analyzedFailingTextLength = analyzedFailingNodesData.reduce(
      (sum, {textLength}) => (sum += textLength),
      0
    );

    return {analyzedFailingNodesData, analyzedFailingTextLength};
  }

  /**
   * @param {LH.Gatherer.PassContext} passContext
   * @return {Promise<LH.Artifacts.FontSize>} font-size analysis
   */
  async afterPass(passContext) {
    /** @type {Map<string, LH.Crdp.CSS.CSSStyleSheetHeader>} */
    const stylesheets = new Map();
    /** @param {LH.Crdp.CSS.StyleSheetAddedEvent} sheet */
    const onStylesheetAdd = sheet => stylesheets.set(sheet.header.styleSheetId, sheet.header);
    passContext.driver.on('CSS.styleSheetAdded', onStylesheetAdd);

    await Promise.all([
      passContext.driver.sendCommand('DOMSnapshot.enable'),
      passContext.driver.sendCommand('DOM.enable'),
      passContext.driver.sendCommand('CSS.enable'),
    ]);

    // We need to find all TextNodes that do not have legible text. DOMSnapshot.captureSnapshot is the
    // fastest way to get the computed styles of every Node. Bonus, it allows for whitelisting properties.
    // Once a bad TextNode is identified, its parent Node is needed. DOMSnapshot.captureSnapshot doesn't
    // give the entire Node object, so DOM.getFlattenedDocument is used. The only connection between a snapshot
    // Node and an actual Protocol Node is backendId, so that is used to join the two data structures.
    const snapshot = await passContext.driver.sendCommand('DOMSnapshot.captureSnapshot', {
      computedStyles: ['font-size'],
    });

    // Makes the strings access code easier to read.
    /** @param {number} index */
    const lookup = (index) => snapshot.strings[index];

    // Locate the document under analysis.
    // TODO: this needs to use frameId
    const doc = snapshot.documents.find(doc => lookup(doc.documentURL) === passContext.url);

    // doc is a flattened property list describing all the Nodes in a document, with all string values
    // deduped in a strings array.
    // Implementation:
    // https://cs.chromium.org/chromium/src/third_party/blink/renderer/core/inspector/inspector_dom_snapshot_agent.cc?sq=package:chromium&g=0&l=534

    if (!doc || !doc.nodes.nodeType || !doc.nodes.nodeName || !doc.nodes.backendNodeId
      || !doc.nodes.nodeValue || !doc.nodes.parentIndex) {
      throw new Error('Unexpected response from DOMSnapshot.captureSnapshot.');
    }

    // Not all nodes have computed styles (ex: TextNodes), so doc.layout.* is smaller than doc.nodes.*
    // doc.layout.nodeIndex maps the index into doc.nodes.* to an index into doc.layout.styles.
    // nodeIndexToStyleIndex inverses that mapping.
    /** @type {Map<number, number>} */
    const nodeIndexToStyleIndex = new Map();
    for (let i = 0; i < doc.layout.nodeIndex.length; i++) {
      nodeIndexToStyleIndex.set(doc.layout.nodeIndex[i], i);
    }

    /** @type {Map<number, {fontSize: number, textLength: number}>} */
    const backendIdsToPartialFontData = new Map();
    for (let i = 0; i < doc.nodes.nodeType.length; i++) {
      const nodeType = doc.nodes.nodeType[i];
      const nodeValue = lookup(doc.nodes.nodeValue[i]);
      if (!isNonEmptyTextNode({
        nodeType,
        nodeValue,
        parentNodeName: lookup(doc.nodes.nodeName[doc.nodes.parentIndex[i]]),
      })) continue;

      const styleIndex = nodeIndexToStyleIndex.get(doc.nodes.parentIndex[i]);
      if (!styleIndex) continue;
      const parentStyles = doc.layout.styles[styleIndex];
      const [fontSizeStringId] = parentStyles;
      const fontSize = parseInt(lookup(fontSizeStringId), 10);
      backendIdsToPartialFontData.set(doc.nodes.backendNodeId[i], {
        fontSize,
        // TODO: trimming this for a second time. maybe don't?
        textLength: getNodeTextLength(nodeValue),
      });
    }

    const nodes = await getAllNodesFromBody(passContext.driver);

    // backendIdsToPartialFontData will include all Nodes,
    // but nodes will only contain the Body node and its descendants.

    /** @type {NodeFontData[]} */
    const failingNodes = [];
    let totalTextLength = 0;
    let failingTextLength = 0;
    for (const node of nodes) {
      const partialFontData = backendIdsToPartialFontData.get(node.backendNodeId);
      if (!partialFontData) continue; // wasn't a non-empty TextNode
      const {fontSize, textLength} = partialFontData;
      totalTextLength += textLength;
      if (fontSize < MINIMAL_LEGIBLE_FONT_SIZE_PX) {
        failingTextLength += textLength;
        failingNodes.push({
          node: node.parentNode,
          textLength,
          fontSize,
        });
      }
    }

    const {
      analyzedFailingNodesData,
      analyzedFailingTextLength,
    } = await FontSize.fetchFailingNodeSourceRules(passContext.driver, failingNodes);

    passContext.driver.off('CSS.styleSheetAdded', onStylesheetAdd);

    analyzedFailingNodesData
      .filter(data => data.cssRule && data.cssRule.styleSheetId)
      // @ts-ignore - guaranteed to exist from the filter immediately above
      .forEach(data => (data.cssRule.stylesheet = stylesheets.get(data.cssRule.styleSheetId)));

    await Promise.all([
      passContext.driver.sendCommand('DOMSnapshot.disable'),
      passContext.driver.sendCommand('DOM.disable'),
      passContext.driver.sendCommand('CSS.disable'),
    ]);

    return {
      analyzedFailingNodesData,
      analyzedFailingTextLength,
      failingTextLength,
      totalTextLength,
    };
  }
}

module.exports = FontSize;
module.exports.TEXT_NODE_TYPE = TEXT_NODE_TYPE;
module.exports.computeSelectorSpecificity = computeSelectorSpecificity;
module.exports.getEffectiveFontRule = getEffectiveFontRule;
