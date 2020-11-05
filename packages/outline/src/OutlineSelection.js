import {getActiveViewModel} from './OutlineView';
import {getNodeKeyFromDOM} from './OutlineReconciler';
import {getNodeByKey} from './OutlineNode';
import {createBlock, createText} from '.';

function Selection(
  anchorKey,
  anchorOffset,
  focusKey,
  focusOffset,
  isCollapsed,
) {
  this.anchorKey = anchorKey;
  this.anchorOffset = anchorOffset;
  this.focusKey = focusKey;
  this.focusOffset = focusOffset;
  this.isCollapsed = isCollapsed;
}

function removeFirstSegment(node) {
  const currentBlock = node.getParentBlock();
  const ancestor = node.getParentBefore(currentBlock);
  const textContent = node.getTextContent();
  const lastSpaceIndex = textContent.indexOf(' ');
  if (lastSpaceIndex > -1) {
    node.spliceText(0, lastSpaceIndex + 1, '', true);
  } else {
    const textNode = createText('');
    ancestor.insertAfter(textNode);
    node.remove();
    textNode.select();
    currentBlock.normalizeTextNodes(true);
  }
}

function removeLastSegment(node) {
  const currentBlock = node.getParentBlock();
  const ancestor = node.getParentBefore(currentBlock);
  const textContent = node.getTextContent();
  const lastSpaceIndex = textContent.lastIndexOf(' ');
  if (lastSpaceIndex > -1) {
    node.spliceText(
      lastSpaceIndex,
      textContent.length - lastSpaceIndex,
      '',
      true,
    );
  } else {
    const textNode = createText('');
    ancestor.insertAfter(textNode);
    node.remove();
    textNode.select();
    currentBlock.normalizeTextNodes(true);
  }
}

Object.assign(Selection.prototype, {
  isCaret() {
    return (
      this.anchorKey === this.focusKey && this.anchorOffset === this.focusOffset
    );
  },
  getAnchorNode() {
    return getNodeByKey(this.anchorKey);
  },
  getFocusNode() {
    return getNodeByKey(this.focusKey);
  },
  getNodes() {
    const anchorNode = this.getAnchorNode();
    const focusNode = this.getFocusNode();
    if (anchorNode === focusNode) {
      return [anchorNode];
    }
    return anchorNode.getNodesBetween(focusNode);
  },
  getRangeOffsets() {
    return [this.anchorOffset, this.focusOffset];
  },
  formatText(formatType) {
    const selectedNodes = this.getNodes();
    const selectedNodesLength = selectedNodes.length;
    const lastIndex = selectedNodesLength - 1;
    let firstNode = selectedNodes[0];
    let lastNode = selectedNodes[lastIndex];
    const firstNodeText = firstNode.getTextContent();
    const firstNodeTextLength = firstNodeText.length;
    const currentBlock = firstNode.getParentBlock();
    const anchorOffset = this.anchorOffset;
    const focusOffset = this.focusOffset;
    const firstNextFlags = firstNode.getTextNodeFormatFlags(formatType, null);
    let startOffset;
    let endOffset;

    if (this.isCaret()) {
      if (
        firstNodeTextLength === 0 &&
        !firstNode.isImmutable() &&
        !firstNode.isSegmented()
      ) {
        firstNode.setFlags(firstNextFlags);
      } else {
        if (anchorOffset === 0) {
          const textNode = createText('');
          textNode.setFlags(firstNextFlags);
          firstNode.insertBefore(textNode);
          textNode.select();
          currentBlock.normalizeTextNodes(true);
        } else {
          debugger;
        }
      }
      return;
    }

    if (selectedNodesLength === 1) {
      if (firstNode.isText() && !firstNode.isImmutable()) {
        startOffset = anchorOffset > focusOffset ? focusOffset : anchorOffset;
        endOffset = anchorOffset > focusOffset ? anchorOffset : focusOffset;

        if (startOffset === endOffset) {
          return;
        }
        if (startOffset === 0 && endOffset === firstNodeTextLength) {
          firstNode.setFlags(firstNextFlags);
          firstNode.select(startOffset, endOffset);
        } else {
          const splitNodes = firstNode.splitText(startOffset, endOffset);
          const replacement = startOffset === 0 ? splitNodes[0] : splitNodes[1];
          replacement.setFlags(firstNextFlags);
          replacement.select(0, endOffset - startOffset);
        }
        currentBlock.normalizeTextNodes(true);
      }
    } else {
      const isBefore = firstNode === this.getAnchorNode();
      startOffset = isBefore ? anchorOffset : focusOffset;
      endOffset = isBefore ? focusOffset : anchorOffset;

      if (firstNode.isText() && !firstNode.isImmutable()) {
        if (startOffset !== 0) {
          [, firstNode] = firstNode.splitText(startOffset);
          startOffset = 0;
        }
        firstNode.setFlags(firstNextFlags);
      }
      if (lastNode.isText() && !lastNode.isImmutable()) {
        const lastNextFlags = lastNode.getTextNodeFormatFlags(
          formatType,
          firstNextFlags,
        );
        const lastNodeText = lastNode.getTextContent();
        const lastNodeTextLength = lastNodeText.length;
        if (endOffset !== lastNodeTextLength) {
          [lastNode] = lastNode.splitText(endOffset);
        }
        lastNode.setFlags(lastNextFlags);
      }

      for (let i = 1; i < lastIndex; i++) {
        const selectedNode = selectedNodes[i];
        if (selectedNode.isText() && !selectedNode.isImmutable()) {
          const selectedNextFlags = lastNode.getTextNodeFormatFlags(
            formatType,
            firstNextFlags,
          );
          selectedNode.setFlags(selectedNextFlags);
        }
      }
      this.setRange(
        firstNode.getKey(),
        startOffset,
        lastNode.getKey(),
        endOffset,
      );
      currentBlock.normalizeTextNodes(true);
    }
  },
  insertParagraph() {
    if (!this.isCaret()) {
      this.removeText();
    }
    const anchorNode = this.getAnchorNode();
    if (!anchorNode.isText()) {
      throw new Error('How is this possible?');
    }
    const currentBlock = anchorNode.getParentBlock();
    const textContent = anchorNode.getTextContent();
    const textContentLength = textContent.length;
    const nodesToMove = anchorNode.getNextSiblings().reverse();
    let anchorOffset = this.anchorOffset;

    if (anchorOffset === 0) {
      nodesToMove.push(anchorNode);
    } else if (anchorOffset === textContentLength) {
      const clonedNode = createText('');
      clonedNode.setFlags(anchorNode.getFlags());
      nodesToMove.push(clonedNode);
      anchorOffset = 0;
    } else if (!anchorNode.isImmutable() && !anchorNode.isSegmented()) {
      const [, splitNode] = anchorNode.splitText(anchorOffset);
      nodesToMove.push(splitNode);
      anchorOffset = 0;
    } else {
      return;
    }
    let nextBlock = currentBlock.getNextSibling();

    if (nextBlock === null) {
      nextBlock = createBlock(currentBlock.getTag());
      currentBlock.insertAfter(nextBlock);
    }
    const nodesToMoveLength = nodesToMove.length;
    let firstChild = nextBlock.getFirstChild();

    for (let i = 0; i < nodesToMoveLength; i++) {
      const nodeToMove = nodesToMove[i];
      if (firstChild === null) {
        nextBlock.append(nodeToMove);
      } else {
        firstChild.insertBefore(nodeToMove);
      }
      firstChild = nodeToMove;
    }
    nodesToMove[nodesToMoveLength - 1].select(anchorOffset, anchorOffset);
    if (currentBlock.getFirstChild() === null) {
      const textNode = createText('');
      currentBlock.append(textNode);
    }
    currentBlock.normalizeTextNodes();
    nextBlock.normalizeTextNodes(true);
  },
  deleteLineBackward() {
    debugger;
  },
  deleteBackward() {
    if (!this.isCaret()) {
      this.removeText();
      return;
    }
    const anchorOffset = this.anchorOffset;
    const anchorNode = this.getAnchorNode();
    const currentBlock = anchorNode.getParentBlock();
    const ancestor = anchorNode.getParentBefore(currentBlock);
    const prevSibling = ancestor.getPreviousSibling();

    if (anchorOffset === 0) {
      if (prevSibling === null) {
        const prevBlock = currentBlock.getPreviousSibling();
        if (prevBlock !== null) {
          const nodesToMove = [anchorNode, ...anchorNode.getNextSiblings()];
          let lastChild = prevBlock.getLastChild();
          for (let i = 0; i < nodesToMove.length; i++) {
            const nodeToMove = nodesToMove[i];
            lastChild.insertAfter(nodeToMove);
            lastChild = nodeToMove;
          }
          nodesToMove[0].select(0, 0);
          currentBlock.remove();
          prevBlock.normalizeTextNodes(true);
        }
      } else if (prevSibling.isText()) {
        if (prevSibling.isImmutable()) {
          prevSibling.remove();
        } else if (prevSibling.isSegmented()) {
          removeLastSegment(prevSibling);
        } else {
          const textContent = prevSibling.getTextContent();
          prevSibling.spliceText(textContent.length - 1, 1, '', true);
        }
      } else {
        throw new Error('TODO');
      }
    } else if (anchorNode.isImmutable()) {
      if (prevSibling === null) {
        const textNode = createText('');
        ancestor.insertBefore(textNode);
        textNode.select();
        currentBlock.normalizeTextNodes(true);
      } else if (prevSibling.isText()) {
        prevSibling.select();
      } else {
        throw new Error('TODO');
      }
      anchorNode.remove();
    } else if (anchorNode.isSegmented()) {
      removeLastSegment(anchorNode);
    } else {
      anchorNode.spliceText(anchorOffset - 1, 1, '', true);
    }
  },
  deleteForward() {
    if (!this.isCaret()) {
      this.removeText();
      return;
    }
    const anchorOffset = this.anchorOffset;
    const anchorNode = this.getAnchorNode();
    const currentBlock = anchorNode.getParentBlock();
    const textContent = anchorNode.getTextContent();
    const textContentLength = textContent.length;
    const ancestor = anchorNode.getParentBefore(currentBlock);
    const nextSibling = ancestor.getNextSibling();

    if (anchorOffset === textContentLength) {
      if (nextSibling === null) {
        const nextBlock = currentBlock.getNextSibling();
        if (nextBlock !== null) {
          const firstChild = nextBlock.getFirstChild();
          const nodesToMove = [firstChild, ...firstChild.getNextSiblings()];
          let target = ancestor;
          for (let i = 0; i < nodesToMove.length; i++) {
            const nodeToMove = nodesToMove[i];
            target.insertAfter(nodeToMove);
            target = nodeToMove;
          }
          nextBlock.remove();
          currentBlock.normalizeTextNodes(true);
        }
      } else if (nextSibling.isText()) {
        if (nextSibling.isImmutable()) {
          nextSibling.remove();
        } else if (nextSibling.isSegmented()) {
          removeFirstSegment(nextSibling);
        } else {
          nextSibling.spliceText(0, 1, '', true);
        }
      } else {
        throw new Error('TODO');
      }
    } else if (anchorNode.isImmutable()) {
      if (nextSibling === null) {
        const textNode = createText('');
        ancestor.insertAfter(textNode);
        textNode.select();
        currentBlock.normalizeTextNodes(true);
      } else if (nextSibling.isText()) {
        nextSibling.select();
      } else {
        throw new Error('TODO');
      }
      anchorNode.remove();
    } else if (anchorNode.isSegmented()) {
      if (anchorOffset === 0) {
        removeFirstSegment(anchorNode);
      } else {
        removeLastSegment(anchorNode);
      }
    } else {
      anchorNode.spliceText(anchorOffset, 1, '', true);
    }
  },
  removeText() {
    this.insertText('');
  },
  insertText(text) {
    const selectedNodes = this.getNodes();
    const selectedNodesLength = selectedNodes.length;
    const anchorOffset = this.anchorOffset;
    const focusOffset = this.focusOffset;
    const firstNode = selectedNodes[0];
    const firstNodeText = firstNode.getTextContent();
    const firstNodeTextLength = firstNodeText.length;
    const currentBlock = firstNode.getParentBlock();
    const ancestor = firstNode.getParentBefore(currentBlock);
    let startOffset;
    let endOffset;

    if (selectedNodesLength === 1) {
      if (
        firstNode.isImmutable() ||
        !firstNode.isText() ||
        firstNode.isSegmented()
      ) {
        const textNode = createText(text);

        if (focusOffset === 0) {
          ancestor.insertBefore(textNode);
        } else {
          ancestor.insertAfter(textNode);
        }
        if (!this.isCaret()) {
          firstNode.remove();
        }

        textNode.select();
        currentBlock.normalizeTextNodes(true);
      } else {
        startOffset = anchorOffset > focusOffset ? focusOffset : anchorOffset;
        endOffset = anchorOffset > focusOffset ? anchorOffset : focusOffset;
        const delCount = endOffset - startOffset;

        firstNode.spliceText(startOffset, delCount, text, true);
      }
    } else {
      const lastIndex = selectedNodesLength - 1;
      const lastNode = selectedNodes[lastIndex];
      const isBefore = firstNode === this.getAnchorNode();
      startOffset = isBefore ? anchorOffset : focusOffset;
      endOffset = isBefore ? focusOffset : anchorOffset;
      let removeFirstNode = false;

      if (firstNode.isImmutable()) {
        removeFirstNode = true;
      } else {
        firstNode.spliceText(
          startOffset,
          firstNodeTextLength - startOffset,
          text,
          true,
        );
      }
      if (!lastNode.isImmutable() && lastNode.isText()) {
        lastNode.spliceText(0, endOffset, '', false);
        firstNode.insertAfter(lastNode);
      } else if (!lastNode.isParentOf(firstNode)) {
        lastNode.remove();
      }

      for (let i = 1; i < lastIndex; i++) {
        const selectedNode = selectedNodes[i];
        if (!selectedNode.isParentOf(firstNode)) {
          selectedNode.remove();
        }
      }
      if (removeFirstNode) {
        const textNode = createText(text);
        ancestor.insertBefore(textNode);
        firstNode.remove();
        textNode.select();
      }
      currentBlock.normalizeTextNodes(true);
    }
  },
  setRange(anchorKey, anchorOffset, focusKey, focusOffset) {
    this.anchorOffset = anchorOffset;
    this.focusOffset = focusOffset;
    this.anchorKey = anchorKey;
    this.focusKey = focusKey;
  },
  getTextContent() {
    const viewModel = getActiveViewModel();
    return viewModel.body.getTextContent();
  },
});

function getFirstChildNode(body) {
  let node = body;
  while (node !== null) {
    if (node.isText()) {
      return node;
    }
    node = node.getFirstChild();
  }
  return null;
}

function getLastChildNode(body) {
  let node = body;
  while (node !== null) {
    if (node.isText()) {
      return node;
    }
    node = node.getLastChild();
  }
  return null;
}

export function getSelection() {
  const viewModel = getActiveViewModel();
  const editor = viewModel._editor;
  let selection = viewModel.selection;
  if (selection === null) {
    const nodeMap = viewModel.nodeMap;
    const windowSelection = window.getSelection();
    const isCollapsed = windowSelection.isCollapsed;
    const anchorDOM = windowSelection.anchorNode;
    const focusDOM = windowSelection.focusNode;
    let anchorOffset = windowSelection.anchorOffset;
    let focusOffset = windowSelection.focusOffset;
    let anchorNode;
    let focusNode;
    let anchorKey;
    let focusKey;

    // When selecting all content in FF, it targets the contenteditable.
    // We need to resolve the first and last text DOM nodes
    if (anchorDOM === focusDOM && anchorDOM === editor.getEditorElement()) {
      const body = viewModel.body;
      anchorNode = getFirstChildNode(body);
      focusNode = getLastChildNode(body);
      anchorKey = anchorNode._key;
      focusKey = focusNode._key;
      anchorOffset = 0;
      focusOffset = focusNode.getTextContent().length;
    } else {
      anchorKey =
        anchorDOM !== null ? getNodeKeyFromDOM(anchorDOM, nodeMap) : null;
      focusKey =
        focusDOM !== null ? getNodeKeyFromDOM(focusDOM, nodeMap) : null;
      anchorNode = getNodeByKey(anchorKey);
      focusNode = getNodeByKey(focusKey);
    }

    if (anchorNode !== null && anchorNode._text === '') {
      anchorOffset = 0;
    }
    if (focusNode !== null && focusNode._text === '') {
      focusOffset = 0;
    }

    selection = viewModel.selection = new Selection(
      anchorKey,
      anchorOffset,
      focusKey,
      focusOffset,
      isCollapsed,
    );
  }
  return selection;
}