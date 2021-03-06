/* eslint-disable */

import {
  pick,
  last,
  append,
  update,
  findLastIndex,
  propEq,
  filter
} from "ramda";

import { Request, Response, Error, Router } from "express";
import User, { UserSchema } from "../models/user";
import Place, { PlaceSchema } from "../models/place";
import VerifyToken from "./VerifyToken";
import { encrypt, decrypt } from "./test";
import cloudinary from "cloudinary";

const HTTPS_REGEX = "^https?://(.*)";

interface Request {
  userId?: string | Buffer | DataView;
  body: any;
}

let RES;

const addPlaceLogic = (id_user: string, actual_place: any) => {
  if (id_user === null || id_user === "") {
    actual_place.using = false;
    actual_place.id_user = "";
  } else {
    actual_place.using = true;
    actual_place.id_user = id_user;
  }
};

const post = (router: Router) => {
  /**
   * This function adds a new user.
   * @param {string} id_user id of the new user
   * @param {string} name name of the new user
   * @param {string} fname family Name of the new user
   * @param {string} id_place place of the new user
   */
  function addUser(
    id_user: string,
    name: string,
    fname: string,
    id_place: string
  ) {
    const actual_user = new User();
    actual_user.id = id_user;
    actual_user.name = name;
    actual_user.fname = fname;
    actual_user.id_place = id_place;
    actual_user.historical = [];
    actual_user.remoteDay = "";
    actual_user.photo = "";
    actual_user.friend = [];

    actual_user.save((err: Error) => {
      if (err) RES.status(500).send(err);
      console.log("User created");
    });
  }

  /**
   * This function update a user.
   * @param {string} id_user id of the user
   * @param {object} params list of parameters
   */
  function updateUser(id_user: string, params) {
    User.findOne(
      { id: id_user },
      null,
      { sort: { _id: -1 } },
      async (err: Error, user) => {
        if (err) RES.status(500).send(err);

        user.historical = params.historical;

        if (params.name !== null) user.name = params.name;

        if (params.fname !== null) user.fname = params.fname;

        if (params.id_place !== null) user.id_place = params.id_place;

        // Here we check if the image if uploaded to cloudinary => params.photo: https://....
        // If not we upload the image
        if (
          params.photo &&
          params.photo.match(HTTPS_REGEX) === null &&
          (params.photo !== "" || params.photo !== null)
        ) {
          const image = await cloudinary.uploader
            .upload(`data:image/jpeg;base64,${params.photo}`)
            .then(result => result.secure_url)
            .catch(error => console.log(error));
          user.photo = image;
        } else {
          user.photo = params.photo;
        }

        if (params.remoteDay) user.remoteDay = params.remoteDay;

        user.save(err => {
          if (err) RES.status(500).send(err);
        });
      }
    );
  }

  /**
   * This function adds a new place.
   * @param {string} id_place id of the new place
   * @param {string} id_user id of the user
   */
  function addPlace(id_place: string, id_user: string) {
    console.log("Create place:");

    const actual_place = new Place();
    actual_place.id = id_place;

    addPlaceLogic(id_user, actual_place);

    actual_place.save((err: Error) => {
      if (err) RES.status(500).send(err);
      console.log("Place Created");
    });
  }

  /**
   * This function update a place.
   * @param {string} id_place id of the current place
   * @param {object} params list of parameters
   */
  function updatePlace(id_place: string | object, params) {
    Place.findOne({ id: id_place }, (err: Error, place: PlaceSchema) => {
      if (err) RES.status(500).send(err);
      if (params.using !== null) place.using = params.using;

      if (params.id_user !== null) place.id_user = params.id_user;

      place.save((err: Error) => {
        if (err) RES.status(500).send(err);
        console.log("Place Updated");
      });
    });
  }

  const isUserExists = (body: any) => {
    User.findOne(
      { id: body.id_user },
      null,
      { sort: { _id: -1 } },
      (err: Error, user: UserSchema) => {
        if (err) return RES.status(500).send("Error on the server.");
        if (!user) {
          const { id_user, name, fname } = body;
          addUser(id_user, name, fname, "");
          console.log("NOT EXISTS");
          return RES.status(200).json({ result: "User Added" });
        }
        if (user && user.name === body.name && user.fname === body.fname) return RES.status(200).send({ user: user });
        else return RES.status(500).send("Error with authentification.");
        // if (user) return res.status(200).send(user);
      }
    );
  };

  /**
   * This function is used to know if a place exists and who.
   * @param {string} id_place id of the current place
   */
  async function whoUses(id_place: string) {
    return await new Promise((resolve, reject) => {
      Place.findOne({ id: id_place }, (err: Error, place: PlaceSchema) => {
        if (!err && place !== null) resolve(place.id_user);
        // "" => not used, "NAME" => used by NAME
        else resolve("#"); // place not exists
      });
    });
  }

  /**
   * This function is used to know where the provided user is seated.
   * @param {string} id_place id of the current user
   */
  async function whereSit(id_user: string) {
    return await new Promise((resolve, reject) => {
      User.findOne(
        { id: id_user },
        null,
        { sort: { _id: -1 } },
        (err: Error, user: UserSchema) => {
          if (!err && user !== null) {
            const userEnd =
              user.historical.length > 0
                ? pick(["end"], last(user.historical))
                : "";
            if (userEnd.end === "") resolve(user.id_place);
            else resolve("");
          } else resolve("#");
        }
      );
    });
  }

  /**
   * This function handle all the post requests.
   * @param {object} body current payload of the request
   */
  async function post(body) {
    const userSit = await whereSit(body.id_user);
    const user = await whoUses(body.id_place);
    if (body.id_place !== "") {
      if (userSit === "#" || userSit === "") {
        const beginDate: string = new Date(Date.now()).toLocaleString();
        if (user === "#") {
          //  not exists or not sit
          console.log("NOT EXISTS");
          updateUser(body.id_user, {
            id_place: body.id_place,
            historical: append(
              { place_id: body.id_place, begin: beginDate, end: "" },
              body.historical
            ),
            name: body.name,
            fname: body.fname,
            remoteDay: body.remoteDay || null,
            photo: body.photo || ""
          });
          //  not exists
          console.log("PLACE NOT EXISTS");
          addPlace(body.id_place, body.id_user);
        } else if (user === "") {
          updateUser(body.id_user, {
            id_place: body.id_place,
            historical: append(
              { place_id: body.id_place, begin: beginDate, end: "" },
              body.historical
            ),
            name: body.name,
            fname: body.fname,
            remoteDay: body.remoteDay || null,
            photo: body.photo || ""
          });
          //  place empty
          console.log("EMPTY PLACE");
          updatePlace(body.id_place, {
            using: true,
            id_user: body.id_user
          });
        } //  used by the "user" user
        else {
          console.log(`PLACE USED BY: ${user}`);
          const userUsedName = await User.findOne(
            { id: user },
            (err: Error, placeUser) => {
              return placeUser;
            }
          );
          return await userUsedName.name;
        }
      } else {
        console.log("SIT");
        if (userSit === body.id_place) {
          const indexUser = findLastIndex(propEq("place_id", body.id_place))(
            body.historical
          );
          // user already sit here and leaves
          const endDate = new Date(Date.now()).toLocaleString();
          updateUser(body.id_user, {
            historical: update(
              indexUser,
              {
                place_id: body.id_place,
                begin: body.historical[indexUser].begin,
                end: endDate
              },
              body.historical
            ),
            id_place: "",
            name: body.name,
            fname: body.fname,
            remoteDay: body.remoteDay || null,
            photo: body.photo || ""
          });
          updatePlace(body.id_place, { using: false, id_user: "" });
        } //  user is sit somewhere and move to another place
        else {
          const endDate = new Date(Date.now()).toLocaleString();
          const indexUser = findLastIndex(propEq("place_id", body.id_place))(
            body.historical
          );
          updateUser(body.id_user, {
            historical: update(
              indexUser,
              {
                place_id: body.id_place,
                begin: body.historical[indexUser].begin,
                end: endDate
              },
              body.historical
            ),
            name: body.name,
            fname: body.fname,
            remoteDay: body.remoteDay || null,
            photo: body.photo || null
          }); //  the other user leaves
          updatePlace(userSit, { using: false, id_user: "" }); // updates the old user place
          updatePlace(body.id_place, {
            using: true,
            id_user: body.id_user
          }); //  the user is now here
        }
      }
    } else {
      updateUser(body.id_user, {
        historical: body.historical,
        name: body.name,
        fname: body.fname,
        remoteDay: body.remoteDay,
        photo: body.photo
      });
    }
  }

  /**
   * This route handle all the post requests.
   */
  router
    .route("/")

    .post(VerifyToken, (req: Request, res: Response) => {
      RES = res;
      const body = req.body;

      if (
        body.id_place === null ||
        body.name === null ||
        body.fname === null ||
        body.id_user === null
      )
        return RES.status(400).json({ error: "Invialid arguments" });

      body.id_user = encrypt(body.id_user, req.userId);
      body.name = encrypt(body.name, req.userId);
      body.fname = encrypt(body.fname, req.userId);
      post(body).then(element => {
        element && typeof element === "string"
          ? RES.status(200).json({
              body: decrypt(element, req.userId)
            })
          : RES.status(200).json({ result: "User Updated" });
      });
    });

  /**
   * This route is used to handle users login.
   */
  router
    .route("/login_user")

    .post(VerifyToken, (req: Request, res: Response) => {
      const body = req.body;
      RES = res;
      if (
        body.name === null ||
        body.fname === null ||
        body.id_user === null ||
        body.id_user.match(process.env.LOGIN_REGEX) === null
      )
        return RES.status(400).json({ error: "Invialid arguments" });
      body.id_user = encrypt(body.id_user, req.userId);
      body.name = encrypt(body.name, req.userId);
      body.fname = encrypt(body.fname, req.userId);

      // Check if the user exists

      isUserExists(body);
    });

  /**
   * This route is used to handle users login.
   */
  router
    .route("/add_friend")

    .post(VerifyToken, (req: Request, res: Response) => {
      const body = req.body;
      RES = res;
      const id_user = encrypt(body.id_user, req.userId);

      User.findOne(
        { id: id_user },
        null,
        { sort: { _id: -1 } },
        (err: Error, user) => {
          if (err) RES.status(400).json({ err });
          if (user) {
            user.friend = append(
              {
                id: body.id,
                name: body.name,
                fname: body.fname,
                id_place: body.id_place,
                photo: body.photo
              },
              user.friend
            );
            user.save((err: Error) => {
              if (err) RES.status(500).send(err);
              RES.status(200).send({ user });
            });
          }
        }
      );
    });

  /**
   * This route is used to handle users login.
   */
  router
    .route("/remove_friend")

    .post(VerifyToken, (req: Request, res: Response) => {
      const body = req.body;
      RES = res;
      const id_user = encrypt(body.id_user, req.userId);

      User.findOne(
        { id: id_user },
        null,
        { sort: { _id: -1 } },
        (err: Error, user) => {
          if (err) RES.status(400).json({ err });
          const isRemovedUser = userFriend => userFriend.id !== body.id;
          if (user) {
            user.friend = filter(isRemovedUser, user.friend);
            user.save((err: Error) => {
              if (err) RES.status(500).send(err);
              RES.status(200).send({ user });
            });
          }
        }
      );
    });

  router
    .route("/add_photo")

    .post(VerifyToken, (req: Request, res: Response) => {
      const body = req.body;
      RES = res;
      const id_user = encrypt(body.id_user, req.userId);

      User.findOne(
        { id: id_user },
        null,
        { sort: { _id: -1 } },
        (err: Error, user) => {
          if (err) RES.status(400).json({ err });
          if (user) {
            user.friend = body.photo;
            user.save((err: Error) => {
              if (err) RES.status(500).send(err);
              RES.status(200).send({ user });
              console.log({ user });
            });
          }
        }
      );
    });

  router
    .route("/settings_user")

    .post(VerifyToken, (req: Request, res: Response) => {
      const body = req.body;
      RES = res;
      const id_user = encrypt(body.id_user, req.userId);

      User.findOne(
        { id: id_user },
        null,
        { sort: { _id: -1 } },
        async (err: Error, user) => {
          if (err) RES.status(400).json({ err });
          if (user) {
            if (
              body.photo &&
              body.photo.match(HTTPS_REGEX) === null &&
              (body.photo !== "" || body.photo !== null)
            ) {
              const image = await cloudinary.uploader
                .upload(`data:image/jpeg;base64,${body.photo}`)
                .then(result => result.secure_url)
                .catch(error => console.log(error));
              user.photo = image;
            } else {
              user.photo = body.photo;
            }
            if (body.remoteDay !== "" && user.remoteDay !== body.remoteDay)
              user.remoteDay = body.remoteDay;
            user.save((err: Error) => {
              if (err) RES.status(500).send(err);
              RES.status(200).send({ user });
              console.log({ user });
            });
          }
        }
      );
    });
};

export default post;
