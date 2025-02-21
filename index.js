const hasBackslash = (state, start) => {
  let slashNum = 0
  let i = start - 1
  while(i >= 0) {
    if (state.src.charCodeAt(i) === 0x5C) { slashNum++; i--; continue }
    break
  }
  return slashNum % 2 === 1 ? true : false
}

const setToken = (state, inlines, opt) => {
  let i = 0
  let attrsIsText = {
    val: false,
    tag: '',
  }
  while (i < inlines.length) {
    let type = inlines[i].type
    //console.log(i, type)
    const tag = type.replace(/(?:_open|_close)$/, '')

    if (/_open$/.test(type)) {
      const startToken = state.push(type, tag, 1)
      startToken.markup = tag === 'strong' ? '**' : '*'
      attrsIsText = {
        val: true,
        tag: tag,
      }
    }

    if (type === 'html_inline') {
      type = 'text'
    }
    if (type === 'text') {
      let content = state.src.slice(inlines[i].s, inlines[i].e + 1)
      //console.log('content: ' + content)
      if (/^\*+$/.test(content)) {
        //console.log('asterisk process::')
        const asteriskToken = state.push(type, '', 0)
        asteriskToken.content = content
        i++
        continue
      }
      if (opt.mditAttrs && attrsIsText.val && i + 1 < inlines.length) {
        const hasImmediatelyAfterAsteriskClose = inlines[i+1].type === attrsIsText.tag + '_close'
        //console.log(hasImmediatelyAfterAsteriskClose, inlines[i+1].type, /^[\s\S]*{[^{}\n!@#%^&*()]+?}$/.test(content))
        if (hasImmediatelyAfterAsteriskClose && /{[^{}\n!@#%^&*()]+?}$/.test(content)) {
          const attrsToken = state.push(type, '', 0)

          const hasBackslashBeforeCurlyAttribute = content.match(/(\\+){/)
          if (hasBackslashBeforeCurlyAttribute) {
            if (hasBackslashBeforeCurlyAttribute[1].length === 1) {
              attrsToken.content = content.replace(/\\{/, '{')
            } else {
              let backSlashNum = Math.floor(hasBackslashBeforeCurlyAttribute[1].length / 2)
              let k = 0
              let backSlash = ''
              while (k < backSlashNum) {
                backSlash +=  '\\'
                k++
              }
              //console.log(backSlashNum, backSlash)
              attrsToken.content = content.replace(/\\+{/, backSlash + '{')
            }
          } else {
            attrsToken.content = content
          }
          attrsIsText.val = false
          i++
          continue
        }
      }

      const childTokens = state.md.parseInline(content, state.env)
      //console.log(childTokens)
      //console.log(childTokens[0].children)
      if (childTokens[0] && childTokens[0].children) {
        let j = 0
        while (j < childTokens[0].children.length) {
          const t = childTokens[0].children[j]
          if (t.type === 'softbreak') {
            t.type = 'text'
            t.tag = ''
            t.content = '\n'
          }
          if (!opt.mditAttrs && t.tag === 'br') {
            t.tag = ''
            t.content = '\n'
          }
          const token = state.push(t.type, t.tag, t.nesting)
          token.attrs = t.attrs
          token.map = t.map
          token.level = t.level
          token.children = t.children
          token.content = t.content
          token.markup = t.markup
          token.info = t.info
          token.meta = t.meta
          token.block = t.block
          token.hidden = t.hidden
          j++
        }
      }
    }

    if (/_close$/.test(type)) {
      const closeToken = state.push(type, tag, -1)
      closeToken.markup = tag === 'strong' ? '**' : '*'
      attrsIsText = {
        val: false,
        tag: '',
      }
    }

    i++
  }
}

const inlinesPush = (inlines, s, e, len, type, tag, tagType) => {
  const inline = {
    s: s,
    sp: s,
    e: e,
    ep: e,
    len: len,
    type: type,
  }
  if (tag) inline.tag = [tag, tagType]
  inlines.push(inline)
}

const hasNextSymbol = (state, n, max, symbol, noMark) => {
  let nextSymbolPos = -1
  if (state.src.charCodeAt(n) === symbol && !hasBackslash(state, n)) {
    let i = n + 1
    let tempNoMark = noMark
    while (i < max) {
      tempNoMark += state.src[i]
      if (state.src.charCodeAt(i) === symbol && !hasBackslash(state, i)) {
        noMark += state.src.substring(n, i + 1)
        nextSymbolPos = i
        break
      }
      i++
    }
  }
  return [nextSymbolPos, noMark]
}

const createInlines = (state, start, max, opt) => {
  let n = start
  let inlines = []
  let noMark = ''
  let textStart = n
  while (n < max) {
    //console.log('n: ' + n + ', state.src[n]: ' + state.src[n] + ', noMark: ' + noMark)
    let nextSymbolPos = -1;
    [nextSymbolPos, noMark] = hasNextSymbol(state, n, max, 0x60, noMark)  // '`'
    if (nextSymbolPos !== -1) {
      if (nextSymbolPos === max - 1) {
        inlinesPush(inlines, textStart, nextSymbolPos, nextSymbolPos - textStart + 1, 'text')
        break
      }
      n = nextSymbolPos + 1
      continue
    }
    if (opt.dollarMath) {
      [nextSymbolPos, noMark] = hasNextSymbol(state, n, max, 0x24, noMark)  // '$'
      if (nextSymbolPos !== -1) {
        if (nextSymbolPos === max - 1) {
          inlinesPush(inlines, textStart, nextSymbolPos, nextSymbolPos - textStart + 1, 'text')
          break
        }
        n = nextSymbolPos + 1
        continue
      }
    }

    if (state.md.options.html) {
      if (state.src.charCodeAt(n) === 0x3C && !hasBackslash(state, n)) { // '<'
        let i = n + 1
        while (i < max) {
          if (state.src.charCodeAt(i) === 0x3E && !hasBackslash(state, i)) { // '>'
            if (noMark.length !== 0) {
              // Add the text before the tag to inlines
              inlinesPush(inlines, textStart, n - 1, n - textStart, 'text')
              noMark = ''
            }
            let tag = state.src.slice(n + 1, i)
            let tagType = ''
            if (/^\//.test(tag)) {
              tag = tag.slice(1)
              tagType = 'close'
            } else {
              tagType = 'open'
            }
            inlinesPush(inlines, n, i, i - n + 1, 'html_inline', tag, tagType)
            textStart = i + 1
            break
          }
          i++
        }
        n = i + 1
        continue
      }
    }

    if (state.src.charCodeAt(n) === 0x2A && !hasBackslash(state, n)) { // '*'
      /*
      if (/[!-)+-/:-@[-`{-~]/.test(state.src[n + 1])) {
        inlinesPush(inlines, textStart, n, n - textStart + 1, 'text')
        noMark = ''
        n++
        textStart = n
        continue
      }*/
      if (n !== 0) {
        //Add text before asterisk to inlines
        inlinesPush(inlines, textStart, n - 1, n - textStart, 'text')
        noMark = ''
      }
      if (n === max - 1) {
        inlinesPush(inlines, n,  n, 1 , '')
        break
      }
      let i = n + 1
      while (i < max) {
        if (state.src.charCodeAt(i) === 0x2A) {
          if (i === max - 1) inlinesPush(inlines, n,  i, i - n + 1 , '')
          i++
          continue
        }
        inlinesPush(inlines, n,  i - 1, i - n, '')
        textStart = i
        break
      }
      n = i
      continue
    }

    noMark += state.src[n]
    if (n === max - 1) {
      inlinesPush(inlines, textStart, n, n - textStart + 1, 'text')
      break
    }
    n++
  }
  return inlines
}

const marksPush = (marks, nest, s, e, len, outsideLen, type) => {
  //console.log('before marks:')
  //console.log(marks)
  const np = {
    nest: nest,
    s: s,
    e: e,
    len: len,
    oLen: outsideLen,
    type: type,
  }
  let i = marks.findIndex(o => o.s > s)
  if (i === -1) {
    marks.push(np)
  } else {
    marks.splice(i, 0, np)
  }
}

const setStrong = (state, inlines, marks, n, memo, opt) => {
  let i = n + 1
  let j = 0
  let nest = 0
  let insideTagsIsClose = 1
  let prevHtmlTags = {...memo.htmlTags}
  while (i < inlines.length) {
    if (inlines[i].len === 0) { i++; continue }
    if (memo.html) {
      if (inlines[i].type === 'html_inline') {
        insideTagsIsClose = isJumpTag(inlines, i, memo, prevHtmlTags)
        //console.log('insideTagsIsClose: ' + insideTagsIsClose )
        if (insideTagsIsClose === -1) return n, nest, memo
        if (insideTagsIsClose === 0) { i++; continue }
      }
    }
    if (inlines[i].type !== '') { i++; continue }

    //console.log('n: ' + n +  ' [strong]: inlines[n].len: ' + inlines[n].len + ', i: ' + i + ', inlines[i].len: ' + inlines[i].len)

    nest = checkNest(inlines, marks, n, i)
    //console.log('n: ' + n +  ' [strong]: nest: ' + nest)
    if (nest === -1) return n, nest, memo
    if (inlines[i].len === 1 && inlines[n].len > 2) {
      //console.log('n: ' + n +  ' [strong]: check em inside strong: ' + nest)
      marksPush(marks, nest, inlines[n].ep, inlines[n].ep, 1, inlines[n].len - 1, 'em_open')
      marksPush(marks, nest, inlines[i].sp, inlines[i].ep, 1, inlines[i].len - 1, 'em_close')
      inlines[n].len -= 1
      inlines[n].ep -= 1
      inlines[i].len = 0
      inlines[i].sp += 1
      if (i++ < inlines.length) {
        i++
        nest++
      } else {
        return n, nest, memo
      }
      if (i > inlines.length - 1) return n, nest, memo
    }

    //console.log('memo.html: ' + memo.html + 'insideTagsIsClose: ' + insideTagsIsClose + 'inlines[i].len: ' + inlines[i].len)
    //if (memo.html && !insideTagsIsClose && inlines[i].len !== 1) {
    if (memo.html && inlines[i].len < 2) {
      i++; continue;
    }

    let strongNum = Math.trunc(Math.min(inlines[n].len, inlines[i].len) / 2)

    if (inlines[i].len > 1) {
      //console.log('n: ' + n +  ' [strong]: normal push, nest: ' + nest)
      j = 0
      while (j < strongNum) {
        //console.log('j: ' + j + ', inlines[i].sp: ' + inlines[i].sp)
        marksPush(marks, nest + strongNum - 1 - j , inlines[n].ep - 1, inlines[n].ep, 2, inlines[n].len - 2,'strong_open')
        inlines[n].ep -= 2
        inlines[n].len -= 2
        marksPush(marks, nest + strongNum - 1 - j, inlines[i].sp, inlines[i].sp + 1, 2, inlines[i].len - 2,'strong_close')
        inlines[i].sp += 2
        inlines[i].len -= 2
        //console.log(marks)
        j++
      }
      if (inlines[n].len === 0) return n, nest, memo
    }

    //console.log('len: ', inlines[n].len, inlines[i].len)
    if ((inlines[n].len > 0 && inlines[i] === 1) || (inlines[n].len === 1 && inlines[i].len > 0)) {
      //console.log('check em that warp strong.')
      nest++
      n, nest, memo = setEm(state, inlines, marks, n, memo, opt, nest)
      if (memo.hasEmThatWrapStrong) {
        //console.log('set em that wrap strong.')
        let k = 0
        while (k < strongNum) {
          marks[marks.length - 2 - k * 2 - 1].nest += 1
          marks[marks.length - 2 - k * 2].nest += 1
          k++
        }
      }
    }
    if (inlines[n].len === 0) return n, nest, memo
    i++
  }
  return n, nest, memo
}

const isJumpTag = (inlines, n, memo, prevHtmlTags) => {
  //console.log(n, 'before::memo.htmlTags: ' + JSON.stringify(memo.htmlTags))
  if (inlines[n].tag === undefined) return 0
  if (memo.htmlTags[inlines[n].tag[0]] === undefined) {
    memo.htmlTags[inlines[n].tag[0]] = 0
  }
  //console.log('prevHtmlTags: ' + JSON.stringify(prevHtmlTags))
  //console.log('memo.htmlTags: ' + JSON.stringify(memo.htmlTags) + ', inlines[n].tag[1]: ' + inlines[n].tag[1])
  if (inlines[n].tag[1] === 'open') {
    memo.htmlTags[inlines[n].tag[0]] += 1
  }
  if (inlines[n].tag[1] === 'close') {
    memo.htmlTags[inlines[n].tag[0]] -= 1
  }
  //console.log('prevHtmlTags: ' + JSON.stringify(prevHtmlTags))
  //console.log('memo.htmlTags: ' + JSON.stringify(memo.htmlTags))
  if (prevHtmlTags[inlines[n].tag[0]] === undefined) prevHtmlTags[inlines[n].tag[0]] = 0
  if (memo.htmlTags[inlines[n].tag[0]] < prevHtmlTags[inlines[n].tag[0]]) {
    return -1
  }
  //console.log(n, 'after::memo.htmlTags: ' + JSON.stringify(memo.htmlTags))
  const closeAllTags = Object.values(memo.htmlTags).every(val => val === 0)
  //console.log('closeAllTags: ' + closeAllTags)
  if (closeAllTags) return 1
  // if (inlines[n].tag[1] === 'close') return -1
  //memo.htmlTags = {}
  return 0
}

const setEm = (state, inlines, marks, n, memo, opt, sNest) => {
  let i = n + 1
  let nest = 0
  let strongPNum = 0
  let insideTagsIsClose = 1 //true
  let prevHtmlTags = {...memo.htmlTags}
  //console.log('memo.prevHtmlTags: ' + JSON.stringify(memo.prevHtmlTags))
  while (i < inlines.length) {
    //console.log('i: ' + i + ', src: ' + state.src.slice(inlines[i].sp, inlines[i].ep + 1) + ', inlines[i]: ' + JSON.stringify(inlines[i]))
    if (inlines[i].len === 0) { i++; continue }
   //console.log('      memo.isEm: ' + memo.isEm + ', memo.html: ' + memo.html + ', inlines[i].type: ' + inlines[i].type)
    if (memo.isEm && memo.html) {
      if (inlines[i].type === 'html_inline') {
        insideTagsIsClose = isJumpTag(inlines, i, memo, prevHtmlTags)
        //console.log('insideTagsIsClose: ' + insideTagsIsClose)
        if (insideTagsIsClose === -1) return n, nest, memo
        if (insideTagsIsClose === 0) { i++; continue }
      }
    }


    if (inlines[i].type !== '') { i++; continue }

    const emNum = Math.min(inlines[n].len, inlines[i].len)
    if (memo.isEm && emNum !== 1) return n, sNest, memo
    //console.log('n: ' + n +  ' [em]: inlines[n].len: ' + inlines[n].len + ', i: ' + i,  ', inlines[i].len: ' + inlines[i].len + ', isEm: ' + memo.isEm)
    //console.log(marks)

    let curlyProcess = false
    if (opt.mditAttrs) {
      const checkText = state.src.slice(inlines[i-1].sp, inlines[i-1].ep + 1)
      if (/{[^{}\n!@#%^&*()]+?}$/.test(checkText)) {
        curlyProcess = true
      }
    }
    //if (memo.isEm && !curlyProcess && inlines[i].len === 2 && !memo.inlineMarkStart) {
    const hasMarkersAtStartAndEnd = (i) => {
      let flag =  memo.inlineMarkStart
      if (!flag) return false
      inlines.length - 1 === i ? flag = true : flag = false
      if (!flag) return false
      inlines[i].len > 1 ? flag = true : flag = false
      return flag
    }
    if (memo.isEm && !curlyProcess && inlines[i].len === 2 && !hasMarkersAtStartAndEnd(i)) {
      strongPNum++
      i++
      continue
    }

    if (sNest) {
      nest  = sNest - 1
    } else {
      nest = checkNest(inlines, marks, n, i)
    }
    //console.log('n: ' + n +  ' [em]: nest: ' + nest)
    if (nest === -1) return n, nest, memo

    if (emNum === 1) {
      //console.log(n, i, 'insideTagsIsClose: ' + insideTagsIsClose, !insideTagsIsClose, inlines[i].len)
      if (memo.html && inlines[i].len < 1) {
        i++; continue;
      }

      //console.log('n: ' + n +  ' [em]: Normal push, nest: ' + nest, ', strongPNum: ' + strongPNum)
      //console.log(inlines[n].ep, inlines[n].sp, inlines[n].s)

      marksPush(marks, nest, inlines[n].ep, inlines[n].ep, 1, inlines[n].len - 1, 'em_open')
      inlines[n].ep -= 1
      inlines[n].len -= 1

      if (strongPNum % 2 === 0 || inlines[i].len < 2) {
        marksPush(marks, nest, inlines[i].sp, inlines[i].sp, 1, inlines[i].len - 1, 'em_close')
        inlines[i].sp += 1
      } else {
        marksPush(marks, nest, inlines[i].ep, inlines[i].ep, 1, inlines[i].len - 1, 'em_close')
        inlines[i].sp = inlines[i].ep - 1
        inlines[i].ep -= 1
      }
      inlines[i].len -= 1
      //console.log(marks)
      if (!memo.isEm) memo.hasEmThatWrapStrong = true
      if (inlines[n].len === 0) return n, nest, memo
    }

    i++
  }
  return n, nest, memo
}

const setText = (inlines, marks, n, nest) => {
  //console.log('n: ' + n + ' [text]: inlines[n].len: ' + inlines[n].len)
  marksPush(marks, nest, inlines[n].sp, inlines[n].ep, inlines[n].len, -1, 'text')
  inlines[n].len = 0
}

const checkNest = (inlines, marks, n, i) => {
  let nest = 1
  let isRange = true
  if (marks.length === 0) return nest
  let strongNest = 0
  let emNest = 0
  let j = 0
  //console.log(inlines)
  //console.log(marks)
  //console.log('n: ' + n + ', i: ' + i + ', inlines[n].s: ' + inlines[n].s + ', inlines[i].s: ' + inlines[i].s)
  while (j < marks.length) {
    if (marks[j].s <= inlines[n].s) {
      if (marks[j].type === 'strong_open') strongNest++
      if (marks[j].type === 'strong_close') strongNest--
      if (marks[j].type === 'em_open') emNest++
      if (marks[j].type === 'em_close') emNest--
    } else { break }
    j++
  }
  let parentNest = strongNest + emNest
  let parentCloseN = j
  //console.log('strongNest: ' + strongNest + ', emNest: ' + emNest + ', parentNest: ' + parentNest + ', parentCloseN: ' + parentCloseN)
  if (parentCloseN < marks.length) {
    while (parentCloseN < marks.length) {
      if (marks[parentCloseN].nest === parentNest) break
      //if (marks.length - 1 == parentCloseN) break
      parentCloseN++
    }
    //console.log('parentCloseN: ' + parentCloseN)
    if (parentCloseN >  marks.length - 1) {
      isRange = true
    } else {
      //console.log(marks[parentCloseN].s, i, inlines[i].s)
      if (marks[parentCloseN].s < inlines[i].s) isRange = false
    }
  }
  //console.log('isRange: ' + isRange)

  if (isRange) {
    nest = parentNest + 1
  } else {
    nest = -1
  }
  return nest
}

const createMarks = (state, inlines, start, end, memo, opt) => {
  let marks = []
  let n = start
  while (n < end) {
    if (inlines[n].type !== '' || inlines[n].len === 0) { n++; continue }
    memo.isEm = inlines[n].len === 1 ? true : false
    memo.wrapEm = 0
    let nest = 0
    //console.log('n: ' + n +  ' ----- inlines:: src: ' + state.src.slice(inlines[n].sp, inlines[n].ep + 1) + ', inlines[n].sp: ' + inlines[n].sp + ', inlines.length: ' + inlines.length + ', memo.isEm: ' + memo.isEm)
    if (!memo.isEm) {
      n, nest, memo = setStrong(state, inlines, marks, n, memo, opt)
    }
    n, nest, memo = setEm(state, inlines, marks, n, memo, opt)
    if (inlines[n].len !== 0) setText(inlines, marks, n, nest)
    //console.log(marks)
    n++
  }
  return marks
}

const fixInlines = (inlines, marks) => {
  let n = 0
  while (n < inlines.length) {
    if (inlines[n].type !== '') { n++; continue }
    let i = 0
    //console.log('n: ' + n + ', inlines[n].s: ' + inlines[n].s + ', inlines[n].e: ' + inlines[n].e)
    while (i < marks.length) {
      //console.log(marks[i].type, marks[i].s, inlines[n].e, marks[i].e, inlines[n].e)
      //console.log(marks[i].s >= inlines[n].s ,  marks[i].e <= inlines[n].e)
      if (marks[i].s >= inlines[n].s && marks[i].e <= inlines[n].e) {
        //console.log('n: ' + n + ', i: ' + i + ', marks[i].type: ' + marks[i].type)
        inlines.splice(n + i + 1, 0, marks[i])
        i++
        continue
      }
      break
    }
    if (marks.length) {
      marks.splice(0, i)
      inlines.splice(n, 1)
      n += i
    } else {
      //if (inlines[n].type === '') inlines[n].type = 'text'
      n++
    }
  }
}

const strongJa = (state, silent, opt) => {
  if (silent) return false
  const start = state.pos
  let max = state.posMax
  let attributesSrc
  if (start > max) return false
  if (state.src.charCodeAt(start) !== 0x2A) return false
  if (hasBackslash(state, start)) return false

  if (opt.mditAttrs) {
    attributesSrc = state.src.match(/((\n)? *){([^{}\n!@#%^&*()]+?)} *$/)
    if (attributesSrc && attributesSrc[3] !== '.') {
      max = state.src.slice(0, attributesSrc.index).length
      if (attributesSrc[2] === '\n') {
        max = state.src.slice(0, attributesSrc.index - 1).length
      }
      if(hasBackslash(state, attributesSrc.index) && attributesSrc[2] === '' && attributesSrc[1].length === 0) {
        max = state.posMax
      }
    } else {
      let endCurlyKet = state.src.match(/(\n *){([^{}\n!@#%^&*()]*?)}.*(} *?)$/)
      if (endCurlyKet) {
        max -= endCurlyKet[3].length
      }
    }
  }

  //console.log('state.src.length(max): ' + state.src.length + (state.src.length === max ? '' : '(' + max + ')') + ', start: ' + start +  ', state.src: ' + state.src)
  let inlines = createInlines(state, start, max, opt)
  //console.log('inlines: ')
  //console.log(inlines)

  const memo = {
    isEm: false,
    hasEmThatWrapStrong: false,
    noSetStrongEnd: false,
    html: state.md.options.html,
    htmlTags: {},
    inlineMarkStart: state.src.charCodeAt(0) === 0x2A ? true : false,
    inlineMarkEnd: state.src.charCodeAt(max - 1) === 0x2A ? true : false,
  }

  let marks = createMarks(state, inlines, 0, inlines.length, memo, opt)
  //console.log('marks: ')
  //console.log(marks)

  fixInlines(inlines, marks)
  //console.log('fix inlines:')
  //console.log(inlines)

  setToken(state, inlines, opt)

  //console.log ('End process:: max:' + max + ', state.posMax: ' + state.posMax + ', opt.mditAttrs: ' + opt.mditAttrs)

  if (opt.mditAttrs && max !== state.posMax) {
    if (!attributesSrc) {
      state.pos = max
      return true
    }
   //console.log('start: ' + start + ', attributesSrc[0]::' + attributesSrc[0] + ', attributesSrc[1].length: ' + attributesSrc[1].length)
    if (attributesSrc[1].length > 1) {
      state.pos = max + attributesSrc[1].length
    } else {
      state.pos = max
    }
  } else {
    state.pos = max + 1
  }
  //console.log(state.tokens)
  return true
}

const mditStrongJa = (md, option) => {
  const opt = {
    dollarMath: true, //inline math $...$
    mditAttrs: true, //markdown-it-attrs
  }
  if (option !== undefined) {
    for (let o in option) {
        opt[o] = option[o]
    }
  }
  md.inline.ruler.before('emphasis', 'strong_ja', (state, silent) => {
    return strongJa(state, silent, opt)
  })
}
export default mditStrongJa