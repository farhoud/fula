const {createClient} = require("@functionland/fula");
const {FulaDID,TaggedEncryption} = require("@functionland/fula-sec");
const fs = require('fs');
const { File } =  require("@web-std/file")
const wrtc = require("wrtc")


const argv = require('yargs/yargs')(process.argv.slice(2))
  .usage('Usage: $0 -i [input-file] --boxid [Box ID] -p ./swarm.key')
  .demandOption(['i'], 'Please specify folder path')
  .demandOption(['p'], 'Please specify swarm-key')
  .demandOption(['boxid'], 'Please specify the Box ID that you would like to connect to.')
  .option('identity', {
    alias: 'u',
    type: 'string',
    description: 'Run with your Mnemonic'
  })
  .argv;

const PHOTOS_PATH= argv.i
const BOX_ID = argv.boxid
const PKEY_PATH = argv.p
const MNEMONIC = argv.u

const netSecret = fs.readFileSync(PKEY_PATH)


async function main() {
  const DID = new FulaDID();
  let didObj;
  if (MNEMONIC) {
    didObj = await DID.importMnemonic(MNEMONIC)
  } else {
    didObj = await DID.create();
  }
  const fula = await createClient({wrtc,netSecret})
  console.log("BoxID:",BOX_ID)
  console.log("authDID:",didObj.authDID)
  const conn = fula.connect(BOX_ID)
  conn.on('connected',async ()=>{
    for await (const file of readFiles(PHOTOS_PATH)) {
      await upload(fula, file, DID)
    }
    console.log("done")
    fula.close()
    process.exit();
  })


}


async function* readFiles(path) {
  const fileNames = await fs.promises.readdir(PHOTOS_PATH)
  console.log(fileNames)
  for (const fileName of fileNames){
    console.log(fileName)
    const buffer = await fs.promises.readFile(PHOTOS_PATH + fileName)
    yield new File([buffer],'fileName')
  }
}

const upload = async (fula, file, userDID) => {
  try {
    const {cid, key} = await fula.sendEncryptedFile(file)
    const tagged = new TaggedEncryption(userDID.did)
    let plaintext = {
      symmetricKey: key,
      CID: cid
    }
    let jwe = await tagged.encrypt(plaintext.symmetricKey, plaintext.CID, [userDID.did.id])
    await fula.graphql(createMutation, {values: [{cid, _id: cid, jwe}]})
  } catch (e) {
    console.log(e.message)
  }
}

const createMutation = `
  mutation addImage($values:JSON){
    create(input:{
      collection:"gallery",
      values: $values
    }){
      cid
    }
  }
`;

main()
